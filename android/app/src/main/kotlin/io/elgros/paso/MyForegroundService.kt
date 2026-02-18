package io.elgros.paso

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.os.*
import android.util.Log
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.core.app.NotificationCompat
import android.media.AudioManager
import android.media.ToneGenerator

class MyForegroundService : Service() {

    private var archivedTrack: DoubleArray? = null 
    private var lastConfirmedStatus: String? = null
    private var greenCounter = 0
    private var redCounter = 0
    private val REQUIRED_CONFIRMATIONS = 2
    private var currentPointIdx = 0
    private var threshDistSq = 0.0000002

    private var wakeLock: PowerManager.WakeLock? = null

    companion object {
        var instance: MyForegroundService? = null 
        const val ACTION_START_FOREGROUND_SERVICE = "ACTION_START_FOREGROUND_SERVICE"
        const val ACTION_STOP_FOREGROUND_SERVICE = "ACTION_STOP_FOREGROUND_SERVICE"
        const val ACTION_UPDATE_REFERENCE_TRACK = "ACTION_UPDATE_REFERENCE_TRACK"
        const val CHANNEL_ID = "gps_sync_channel"
        const val NOTIFICATION_ID = 101
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        createNotificationChannel()
        Log.d("PasoService", "Cerebro del servicio creado.")
    }

    // --- CORAZÓN DE LA ESTRATEGIA HÍBRIDA ---
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_FOREGROUND_SERVICE -> {
                acquireWakeLock()
                startForegroundServiceInternal()
            }
            ACTION_UPDATE_REFERENCE_TRACK -> {
                val coords = intent.getDoubleArrayExtra("coords")
                lastConfirmedStatus = null
                greenCounter = 0
                redCounter = 0
                if (coords != null && coords.isNotEmpty()) {
                    archivedTrack = coords
                    currentPointIdx = 0
                    Log.d("PasoService", "🎯 Track recibido.")
                } else {
                    archivedTrack = null
                    currentPointIdx = 0
                    updateNotification("The GPS tracking is active")
                }
            }
            ACTION_STOP_FOREGROUND_SERVICE -> {
                stopSelf()
            }
        }
        // STICKY: Para que Xiaomi intente revivirlo si lo mata por batería
        return START_STICKY
    }

    // SWIPE AWAY: Para que se cierre cuando TÚ quieras (al quitarla de recientes)
    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        Log.d("PasoService", "🧹 Swipe detectado. Deteniendo Cerebro.")
        stopSelf()
    }

    fun evaluateLocation(lon: Double, lat: Double) {
      val track = archivedTrack ?: return
      val currentResult = checkOnRouteNative(lon, lat)
      MyServicePlugin.instance?.notifyStatusToJS(currentResult)
      
      if (currentResult == "green") {
          greenCounter++
          redCounter = 0
      } else {
          redCounter++
          greenCounter = 0
      }
      if (lastConfirmedStatus == null) {
        if (greenCounter >= REQUIRED_CONFIRMATIONS) lastConfirmedStatus = "green"
        if (redCounter >= REQUIRED_CONFIRMATIONS) lastConfirmedStatus = "red"
        return 
      }
      if (redCounter >= REQUIRED_CONFIRMATIONS && lastConfirmedStatus == "green") {
        triggerAlertLostPath() 
        updateNotification("⚠️ Fuera de ruta")
        lastConfirmedStatus = "red"
      }
      if (greenCounter >= REQUIRED_CONFIRMATIONS && lastConfirmedStatus == "red") {
        triggerAlertBackOnTrack() 
        updateNotification("✅ Camino recuperado")
        lastConfirmedStatus = "green"
      }
    }

    private fun checkOnRouteNative(currentLon: Double, currentLat: Double): String {
        val track = archivedTrack ?: return "black" 
        val cosLat = Math.cos(Math.toRadians(currentLat))
        val numPoints = track.size / 2
        
        fun getDistSq(idx: Int): Double {
            val dLon = (currentLon - track[idx * 2]) * cosLat
            val dLat = currentLat - track[idx * 2 + 1]
            return dLon * dLon + dLat * dLat
        }
        
        val window = 200
        val start = (currentPointIdx - window).coerceAtLeast(0)
        val end = (currentPointIdx + window).coerceAtMost(numPoints - 1)
        
        for (i in currentPointIdx..end) {
            if (getDistSq(i) < threshDistSq) {
                currentPointIdx = i
                return "green"
            }
        }
        for (i in 0 until numPoints step 3) {
            if (getDistSq(i) < threshDistSq) {
                currentPointIdx = i
                return "green"
            }
        }
        return "red"
    }

    private fun triggerAlertLostPath() {
        val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        val pattern = longArrayOf(0, 200, 100, 200)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(pattern, -1)
        }
        try {
            val tg = ToneGenerator(AudioManager.STREAM_ALARM, 100)
            tg.startTone(ToneGenerator.TONE_SUP_ERROR, 500) 
            Handler(Looper.getMainLooper()).postDelayed({ tg.release() }, 1000)
        } catch (e: Exception) {}
    }

    private fun triggerAlertBackOnTrack() {
        val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createOneShot(500, VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(500)
        }
        try {
            val tg = ToneGenerator(AudioManager.STREAM_ALARM, 80)
            tg.startTone(ToneGenerator.TONE_PROP_ACK, 200) 
            Handler(Looper.getMainLooper()).postDelayed({ tg.release() }, 500)
        } catch (e: Exception) {}
    }

    private fun startForegroundServiceInternal() {
        val builder = createNotificationBuilder("The app is running in the background")
        val notification = builder.build()
        val hasLocation = ContextCompat.checkSelfPermission(
            this, android.Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

        if (!hasLocation) return

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ServiceCompat.startForeground(
                    this, 1001, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
                )
            } else {
                startForeground(1001, notification)
            }
        } catch (e: Exception) {
            Log.e("PasoService", "❌ Error al iniciar FGS: ${e.message}")
        }
    }

    private fun updateNotification(text: String) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, createNotificationBuilder(text).build())
    }

    private fun createNotificationBuilder(text: String): NotificationCompat.Builder {
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
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW) 
            .setCategory(NotificationCompat.CATEGORY_SERVICE) 
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID, "Paso Cerebro Service", NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Mantiene la lógica de seguimiento activa"
                enableLights(true)
                lightColor = Color.RED
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    private fun acquireWakeLock() {
        if (wakeLock == null) {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"PasoApp::MainBrainLock")
            wakeLock?.acquire(10 * 60 * 60 * 1000L)
        }
    }

    override fun onDestroy() {
        instance = null
        if (wakeLock?.isHeld == true) wakeLock?.release()
        Log.d("PasoService", "Cerebro destruido.")
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}