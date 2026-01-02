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

class MyForegroundService : Service() {

    // --- VARIABLES DE ESTADO Y SEGUIMIENTO ---
    private var archivedTrack: DoubleArray? = null // Estructura: [lon0, lat0, lon1, lat1...]
    private var currentPointIdx = 0
    private var threshDistSq = 0.00000002 // Equivalente a tu threshDist de Angular

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

    // --- CORAZÓN DEL SERVICIO: EVALUAR POSICIÓN ---
    /**
     * Esta función es llamada por PasoService cada vez que llega un punto GPS.
     */
    fun evaluateLocation(lon: Double, lat: Double) {
        // Si no hay track, salimos antes de hacer NADA (ni siquiera logs o cálculos de cosenos)
        val track = archivedTrack ?: return 
        
        val result = checkOnRouteNative(lon, lat)
        if (result == "red") {
            triggerAlert()
        } else if (result == "green") {
            // Opcional: limpiar el mensaje de alerta de la notificación si volvemos a ruta
            updateNotification("Siguiendo ruta correctamente")
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

    private fun triggerAlert() {
        // Vibración
        val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        if (vibrator.hasVibrator()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createOneShot(500, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")       
                vibrator.vibrate(500)
            }
        }

        // Sonido de alerta
        try {
            val alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            val ringtone = RingtoneManager.getRingtone(applicationContext, alarmUri)
            ringtone.play()
        } catch (e: Exception) {
            Log.e("PasoService", "Error al reproducir sonido: ${e.message}")
        }

        updateNotification("⚠️ ¡TE HAS SALIDO DE LA RUTA!")
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
                if (coords != null && coords.isNotEmpty()) {
                    archivedTrack = coords
                    currentPointIdx = 0
                    Log.d("PasoService", "🎯 Track recibido: ${coords.size / 2} puntos")
                } else {
                    archivedTrack = null
                    currentPointIdx = 0 // Importante resetear
                    Log.d("PasoService", "📴 Alerta desactivada (Track limpiado)")
                    updateNotification("GPS activo - Sin ruta cargada")
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
        val builder = createNotificationBuilder("Iniciando seguimiento GPS...")
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
            .setContentTitle("Paso: Grabando Ruta")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setSilent(true) // Evita que el móvil vibre/suene cada vez que actualizas la notificación
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
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "PasoApp::MainBrainLock")
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