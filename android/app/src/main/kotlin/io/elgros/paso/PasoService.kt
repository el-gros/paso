package io.elgros.paso

import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject
import org.json.JSONArray
import java.io.OutputStreamWriter
import java.util.concurrent.CopyOnWriteArrayList

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.*
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.google.android.gms.location.*
import android.media.AudioManager
import android.media.ToneGenerator

import io.elgros.paso.R // 🚀 IMPORTANTE: Añadida la importación de recursos

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
    private var threshDistSq = 0.0000002

    // Configuración Supabase
    private var isSharing = false
    private var shareToken: String? = null
    private var deviceId: String? = null
    private var supabaseUrl: String? = null
    private var supabaseKey: String? = null
    private var shareTickCounter = 0
    private val SHARE_TICKS_TARGET = 6

    // 🎒 NUEVO: La Cola Local (CopyOnWriteArrayList evita crashes si se lee y escribe a la vez)
    private val pendingUploads = CopyOnWriteArrayList<JSONObject>()
    private val MAX_QUEUE_SIZE = 1000 // Límite de seguridad para no ahogar la RAM

    companion object {
        const val ACTION_START = "ACTION_START"
        const val ACTION_STOP = "ACTION_STOP"
        const val ACTION_UPDATE_TRACK = "ACTION_UPDATE_TRACK"
        const val ACTION_UPDATE_SHARING = "ACTION_UPDATE_SHARING"
    }

    override fun onCreate() {
        super.onCreate()
        fusedClient = LocationServices.getFusedLocationProviderClient(this)
        
        callback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                val currentTime = System.currentTimeMillis()
                if (currentTime - lastUpdateTime < 8000L) return
                lastUpdateTime = currentTime

                result.locations.forEach { loc ->
                    MyServicePlugin.instance?.sendLocationToJS(loc)
                    evaluateLocation(loc.longitude, loc.latitude)
                    handleNativeSharing(loc)
                }
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) return START_STICKY
        when (intent.action) {
            ACTION_START -> {
                acquireWakeLock()
                // 🚀 TEXTO TRADUCIDO: Al arrancar el tracking
                startForegroundServiceSafe(getString(R.string.notification_recording_track))
                startLocationUpdates()
            }
            ACTION_UPDATE_SHARING -> {
                isSharing = intent.getBooleanExtra("isSharing", false)
                shareToken = intent.getStringExtra("shareToken")
                deviceId = intent.getStringExtra("deviceId")
                supabaseUrl = intent.getStringExtra("supabaseUrl")
                supabaseKey = intent.getStringExtra("supabaseKey")
                shareTickCounter = 0 // Reset al cambiar config
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

    // 📡 NUEVO: Función para comprobar si hay internet real
    private fun isNetworkAvailable(): Boolean {
        val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = connectivityManager.activeNetwork ?: return false
        val activeNetwork = connectivityManager.getNetworkCapabilities(network) ?: return false
        return when {
            activeNetwork.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> true
            activeNetwork.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> true
            else -> false
        }
    }

    private fun handleNativeSharing(loc: Location) {
        if (!isSharing || shareToken == null || supabaseUrl == null) return

        // 🛡️ FILTRO DE INCERTIDUMBRE (Accuracy en metros)
        if (loc.hasAccuracy() && loc.accuracy > 40.0f) {
            Log.d("PasoNative", "📍 Punto descartado para Supabase por baja precisión: ${loc.accuracy}m")
            return 
        }

        val bestAltitude = if (Build.VERSION.SDK_INT >= 34 && loc.hasMslAltitude()) {
            loc.mslAltitudeMeters
        } else {
            loc.altitude
        }
        
        // 1. Convertimos la coordenada a JSON usando el tiempo real del GPS (loc.time)
        val jsonPoint = JSONObject().apply {
            put("share_token", shareToken)
            put("owner_user_id", deviceId)
            put("lat", loc.latitude)
            put("lon", loc.longitude)
            put("alt", bestAltitude)
            val sdf = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
            sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")
            put("updated_at", sdf.format(java.util.Date(loc.time)))
        }

        // 2. Lo metemos en la mochila (si no está llena)
        if (pendingUploads.size < MAX_QUEUE_SIZE) {
            pendingUploads.add(jsonPoint)
        }

        shareTickCounter++
        if (shareTickCounter >= SHARE_TICKS_TARGET) {
            shareTickCounter = 0
            
            // 3. Comprobamos la red ANTES de gastar batería abriendo un hilo
            if (isNetworkAvailable()) {
                uploadBatchToSupabase()
            } else {
                Log.d("PasoNative", "🚫 Sin red. Puntos guardados en mochila local: ${pendingUploads.size}")
            }
        }
    }

    private fun uploadBatchToSupabase() {
        if (pendingUploads.isEmpty()) return

        // Extraemos una copia de los puntos actuales para no bloquear el GPS si llegan nuevos
        val batch = pendingUploads.toList()
        val jsonArray = JSONArray(batch)

        Thread {
            try {
                Log.d("PasoNative", "☁️ Intentando subir bloque de ${batch.size} puntos...")
                val url = URL("$supabaseUrl/rest/v1/public_locations")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.setRequestProperty("apikey", supabaseKey)
                conn.setRequestProperty("Authorization", "Bearer $supabaseKey")
                conn.doOutput = true

                // Subimos el ARRAY entero de golpe
                OutputStreamWriter(conn.outputStream).use { it.write(jsonArray.toString()) }
                
                val responseCode = conn.responseCode
                if (responseCode in 200..299) {
                    Log.d("PasoNative", "✅ Sync Supabase OK: $responseCode")
                    // Si ha ido bien, borramos ESTOS puntos de la mochila principal
                    pendingUploads.removeAll(batch)
                } else {
                    Log.e("PasoNative", "❌ Error Supabase HTTP: $responseCode")
                }
                
                conn.disconnect()
            } catch (e: Exception) {
                Log.e("PasoNative", "❌ Fallo de conexión subiendo a Supabase", e)
                // Si falla por microcorte, no hacemos removeAll(). Los puntos seguirán ahí.
            }
        }.start()
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
            // 🚀 TEXTO TRADUCIDO: Al salirse de la ruta
            updateNotification(getString(R.string.notification_off_route))
            lastConfirmedStatus = "red"
        } else if (greenCounter >= REQUIRED_CONFIRMATIONS && lastConfirmedStatus == "red") {
            triggerAlert(false)
            // 🚀 TEXTO TRADUCIDO: Al volver a la ruta
            updateNotification(getString(R.string.notification_on_route))
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
            if (getDistSq(i) < threshDistSq) { currentPointIdx = i; return "green" }
        }
        for (i in 0 until numPoints step 3) {
            if (getDistSq(i) < threshDistSq) { currentPointIdx = i; return "green" }
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
        
        // Intentar último envío antes de morir
        if (pendingUploads.isNotEmpty() && isNetworkAvailable()) {
            uploadBatchToSupabase()
        }
        
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