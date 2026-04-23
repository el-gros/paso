package io.elgros.paso

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.*
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.google.android.gms.location.*
import android.media.AudioManager
import android.media.ToneGenerator

import io.elgros.paso.R 

class PasoService : Service() {

    private lateinit var fusedClient: FusedLocationProviderClient
    private lateinit var callback: LocationCallback
    private var wakeLock: PowerManager.WakeLock? = null
    private val NOTIFICATION_ID = 101
    private val CHANNEL_ID = "paso_gps_channel"
    private var lastUpdateTime: Long = -10000L

    // Lógica de Ruta
    private var archivedTrack: DoubleArray? = null 
    private var lastConfirmedStatus: String? = null
    private var greenCounter = 0
    private var redCounter = 0
    private val REQUIRED_CONFIRMATIONS = 2
    private var currentPointIdx = 0
    private var threshDistSq = 0.0000002 // Ajustar según necesidad de precisión

    companion object {
        const val ACTION_START = "ACTION_START"
        const val ACTION_STOP = "ACTION_STOP"
        const val ACTION_UPDATE_TRACK = "ACTION_UPDATE_TRACK"
    }

    override fun onCreate() {
        super.onCreate()
        fusedClient = LocationServices.getFusedLocationProviderClient(this)
        
        callback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                val currentTime = System.currentTimeMillis()
                // Filtro de frecuencia de muestreo (mínimo cada 8 seg)
                if (currentTime - lastUpdateTime < 8000L) return
                lastUpdateTime = currentTime

                result.locations.forEach { loc ->
                    MyServicePlugin.instance?.sendLocationToJS(loc)
                    evaluateLocation(loc.longitude, loc.latitude)
                }
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) return START_STICKY
        when (intent.action) {
            ACTION_START -> {
                acquireWakeLock()
                startForegroundServiceSafe(getString(R.string.notification_recording_track))
                startLocationUpdates()
            }
            ACTION_UPDATE_TRACK -> {
                val coords = intent.getDoubleArrayExtra("coords")
                archivedTrack = coords
                currentPointIdx = 0
                lastConfirmedStatus = null
            }
            ACTION_STOP -> stopSelf()
        }
        return START_STICKY
    }

    private fun evaluateLocation(lon: Double, lat: Double) {
        val track = archivedTrack ?: return
        val currentResult = checkOnRouteNative(lon, lat)
        
        val indexToSend = if (currentResult == "green") currentPointIdx else -1
        MyServicePlugin.instance?.notifyStatusToJS(currentResult, indexToSend)
        
        if (currentResult == "green") { greenCounter++; redCounter = 0 } 
        else { redCounter++; greenCounter = 0 }

        if (lastConfirmedStatus == null) {
            if (greenCounter >= REQUIRED_CONFIRMATIONS) lastConfirmedStatus = "green"
            if (redCounter >= REQUIRED_CONFIRMATIONS) lastConfirmedStatus = "red"
            return 
        }

        if (redCounter >= REQUIRED_CONFIRMATIONS && lastConfirmedStatus == "green") {
            triggerAlert(true)
            updateNotification(getString(R.string.notification_off_route))
            lastConfirmedStatus = "red"
        } else if (greenCounter >= REQUIRED_CONFIRMATIONS && lastConfirmedStatus == "red") {
            triggerAlert(false)
            updateNotification(getString(R.string.notification_on_route))
            lastConfirmedStatus = "green"
        }
    }

    private fun checkOnRouteNative(currentLon: Double, currentLat: Double): String {
        val track = archivedTrack ?: return "black"
        val numPoints = track.size / 2
        if (numPoints < 2) return "red"

        val cosLat = Math.cos(Math.toRadians(currentLat))

        // Función matemática: Distancia mínima punto-segmento
        fun getDistSqToSegment(idx1: Int, idx2: Int): Double {
            val x1 = track[idx1 * 2] * cosLat
            val y1 = track[idx1 * 2 + 1]
            val x2 = track[idx2 * 2] * cosLat
            val y2 = track[idx2 * 2 + 1]
            val px = currentLon * cosLat
            val py = currentLat

            val dx = x2 - x1
            val dy = y2 - y1

            if (dx == 0.0 && dy == 0.0) {
                return (px - x1) * (px - x1) + (py - y1) * (py - y1)
            }

            var t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)
            t = t.coerceIn(0.0, 1.0)

            val closestX = x1 + t * dx
            val closestY = y1 + t * dy
            
            return (px - closestX) * (px - closestX) + (py - closestY) * (py - closestY)
        }

        // 1. Ventana local (búsqueda eficiente)
        val window = 50 
        val end = (currentPointIdx + window).coerceAtMost(numPoints - 2)

        for (i in currentPointIdx..end) {
            if (getDistSqToSegment(i, i + 1) < threshDistSq) {
                currentPointIdx = i
                return "green"
            }
        }

        // 2. Búsqueda global (si nos hemos desviado mucho)
        for (i in 0 until (numPoints - 1) step 5) {
            if (getDistSqToSegment(i, i + 1) < threshDistSq) {
                currentPointIdx = i
                return "green"
            }
        }
        return "red"
    }

    private fun triggerAlert(isError: Boolean) {
        val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        if (isError) {
            val pattern = longArrayOf(0, 200, 100, 200)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
            } else { vibrator.vibrate(pattern, -1) }
            playSound(ToneGenerator.TONE_SUP_ERROR)
        } else {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createOneShot(500, VibrationEffect.DEFAULT_AMPLITUDE))
            } else { vibrator.vibrate(500) }
            playSound(ToneGenerator.TONE_PROP_ACK)
        }
    }

    private fun playSound(toneType: Int) {
        try {
            val tg = ToneGenerator(AudioManager.STREAM_ALARM, 80)
            tg.startTone(toneType, 300)
            Handler(Looper.getMainLooper()).postDelayed({ tg.release() }, 600)
        } catch (e: Exception) {}
    }

    private fun startLocationUpdates() {
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5000L)
            .setMinUpdateIntervalMillis(2000L)
            .build()
        try {
            fusedClient.requestLocationUpdates(request, callback, Looper.getMainLooper())
        } catch (e: SecurityException) { Log.e("Paso", "Error permisos") }
    }

    private fun startForegroundServiceSafe(text: String) {
        createNotificationChannel()
        val notification = createNotification(text)
        if (Build.VERSION.SDK_INT >= 34) {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun createNotification(text: String): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, launchIntent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Paso")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
            .build()
    }

    private fun updateNotification(text: String) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, createNotification(text))
    }

    private fun acquireWakeLock() {
        if (wakeLock == null) {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "PasoApp::UnifiedLock")
            wakeLock?.acquire(10 * 60 * 60 * 1000L)
        }
    }

    override fun onDestroy() {
        if (wakeLock?.isHeld == true) wakeLock?.release()
        try { fusedClient.removeLocationUpdates(callback) } catch (e: Exception) {}
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, "Paso GPS", NotificationManager.IMPORTANCE_HIGH)
            getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
        }
    }

    override fun onBind(intent: Intent?) = null
}