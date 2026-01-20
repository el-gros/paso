package io.elgros.paso

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.media.RingtoneManager
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

    // --- VARIABLES DE ESTADO Y SEGUIMIENTO ---
    private var archivedTrack: DoubleArray? = null // Estructura: [lon0, lat0, lon1, lat1...]
    private var lastConfirmedStatus: String? = null
    private var greenCounter = 0
    private var redCounter = 0
    private val REQUIRED_CONFIRMATIONS = 2
    private var currentPointIdx = 0
    private var threshDistSq = 0.00000008

    private var wakeLock: PowerManager.WakeLock? = null
    private val handler = Handler(Looper.getMainLooper())

    companion object {
        var instance: MyForegroundService? = null // Para que PasoService pueda llamarlo
        const val ACTION_START_FOREGROUND_SERVICE = "ACTION_START_FOREGROUND_SERVICE"
        const val ACTION_STOP_FOREGROUND_SERVICE = "ACTION_STOP_FOREGROUND_SERVICE"
        const val ACTION_UPDATE_REFERENCE_TRACK = "ACTION_UPDATE_REFERENCE_TRACK"
        const val CHANNEL_ID = "gps_sync_channel"
        const val NOTIFICATION_ID = 101
    }

    // Función para reiniciar el estado
    fun resetRouteState() {
        lastConfirmedStatus = null
        greenCounter = 0
        redCounter = 0
        Log.d("MyForegroundService", "🔄 Estado de ruta reiniciado")
    }

    // --- CORAZÓN DEL SERVICIO: EVALUAR POSICIÓN ---
    /**
     * Esta función es llamada por PasoService cada vez que llega un punto GPS.
     */
    fun evaluateLocation(lon: Double, lat: Double) {
      // Si no hay track, salimos antes de hacer NADA (ni siquiera logs o cálculos de cosenos)
      val track = archivedTrack ?: return
      val currentResult = checkOnRouteNative(lon, lat)
      // Gestión de contadores
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
        return // Salimos porque en el arranque no queremos sonidos
      }
      if (redCounter >= REQUIRED_CONFIRMATIONS && lastConfirmedStatus == "green") {
        // Solo suena si ya teníamos un estado previo (es decir, veníamos de Verde)
        triggerAlertLostPath() // Suena tras G-G-R-R
        updateNotification("⚠️ Fuera de ruta")
        lastConfirmedStatus = "red"
      }
      if (greenCounter >= REQUIRED_CONFIRMATIONS && lastConfirmedStatus == "red") {
        // Solo suena si veníamos de estar perdidos (Rojo)
        triggerAlertBackOnTrack() // Suena tras R-R-G-G
        updateNotification("✅ Camino recuperado")
        lastConfirmedStatus = "green"
      }
    }

    private fun checkOnRouteNative(currentLon: Double, currentLat: Double): String {
        val track = archivedTrack ?: return "black" // Si no hay track, no evaluamos
        val cosLat = Math.cos(Math.toRadians(currentLat))
        val numPoints = track.size / 2
        // Función de distancia rápida (al cuadrado para evitar Math.sqrt)
        fun getDistSq(idx: Int): Double {
            val dLon = (currentLon - track[idx * 2]) * cosLat
            val dLat = currentLat - track[idx * 2 + 1]
            return dLon * dLon + dLat * dLat
        }
        // 1. Lógica de Ventana (como en tu TypeScript)
        val window = 200
        val start = (currentPointIdx - window).coerceAtLeast(0)
        val end = (currentPointIdx + window).coerceAtMost(numPoints - 1)
        // Buscamos hacia adelante desde la última posición conocida
        for (i in currentPointIdx..end) {
            if (getDistSq(i) < threshDistSq) {
                currentPointIdx = i
                return "green"
            }
        }
        // 2. Búsqueda Global de recuperación (si nos salimos de la ventana)
        // Usamos step 5 para que sea muy rápido en tracks largos
        for (i in 0 until numPoints step 5) {
            if (getDistSq(i) < threshDistSq) {
                currentPointIdx = i
                return "green"
            }
        }
        return "red"
    }

    private fun triggerAlertLostPath() {
        // 1. VIBRACIÓN: Doble pulso corto
        val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        val pattern = longArrayOf(0, 200, 100, 200)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(pattern, -1)
        }
        // 2. SONIDO: Tono de error (Grave)
        try {
            val tg = ToneGenerator(AudioManager.STREAM_ALARM, 100)
            tg.startTone(ToneGenerator.TONE_SUP_ERROR, 500) 
            // Liberar recursos
            Handler(Looper.getMainLooper()).postDelayed({ 
                tg.release() 
            }, 1000)
        } catch (e: Exception) { 
            Log.e("Paso", "Error sonido: ${e.message}") 
        }
    }

    private fun triggerAlertBackOnTrack() {
        // 1. VIBRACIÓN: Un solo pulso largo (Confirmación)
        val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createOneShot(500, VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(500)
        }
        // 2. SONIDO: Tono de confirmación (Agudo y breve)
        try {
            // Bajamos ligeramente el volumen (80) para que sea menos intrusivo que la alerta de error
            val tg = ToneGenerator(AudioManager.STREAM_ALARM, 80)
            // TONE_PROP_ACK: Es el sonido estándar de "comando aceptado"
            tg.startTone(ToneGenerator.TONE_PROP_ACK, 200) 
            // Liberamos el recurso rápido (500ms) porque el tono es corto
            Handler(Looper.getMainLooper()).postDelayed({ 
                tg.release() 
            }, 500)
        } catch (e: Exception) { 
            Log.e("Paso", "Error sonido: ${e.message}") 
        }
    }

    // --- CICLO DE VIDA DEL SERVICIO ---
    override fun onCreate() {
        super.onCreate()
        instance = this
        createNotificationChannel()
        Log.d("PasoService", "Cerebro del servicio creado.")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_FOREGROUND_SERVICE -> {
                acquireWakeLock()
                startForegroundServiceInternal()
            }
            ACTION_UPDATE_REFERENCE_TRACK -> {
                val coords = intent.getDoubleArrayExtra("coords")
                // IMPORTANTE: Reseteamos siempre el estado de las alertas al recibir un cambio de track
                lastConfirmedStatus = null
                greenCounter = 0
                redCounter = 0
                if (coords != null && coords.isNotEmpty()) {
                    archivedTrack = coords
                    currentPointIdx = 0
                    Log.d("PasoService", "🎯 Track recibido: ${coords.size / 2} puntos. Contadores reiniciados.")
                } else {
                    archivedTrack = null
                    currentPointIdx = 0
                    Log.d("PasoService", "📴 Alerta desactivada (Track limpiado)")
                    updateNotification("The GPS tracking is active")
                }
            }
            ACTION_STOP_FOREGROUND_SERVICE -> {
                stopSelf()
            }
        }
        return START_STICKY
    }

    private fun startForegroundServiceInternal() {
        // Usamos el nombre exacto de tu función y le pasamos un texto inicial
        val builder = createNotificationBuilder("The app is running in the background")
        val notification = builder.build()
        val hasLocation = ContextCompat.checkSelfPermission(
            this,
            android.Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

        if (!hasLocation) {
            Log.e("PasoService", "❌ No se puede iniciar: Falta permiso de ubicación")
            return
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ServiceCompat.startForeground(
                    this,
                    1001, // Asegúrate de que este ID sea un número entero (ej: 1001)
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
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
        // CAMBIO IMPORTANTE: Usar FLAG_IMMUTABLE o FLAG_UPDATE_CURRENT según sea necesario.
        // En Android 14+, si el Intent puede ser nulo o requiere actualización,
        // se recomienda asegurar la compatibilidad.
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Paso")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW) // Cambiado a LOW para servicios en segundo plano
            .setCategory(NotificationCompat.CATEGORY_SERVICE) // Ayuda al sistema a clasificar el servicio
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Paso Cerebro Service",
                NotificationManager.IMPORTANCE_HIGH
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

