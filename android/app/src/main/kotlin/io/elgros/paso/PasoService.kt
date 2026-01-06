package io.elgros.paso

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat // Asegúrate de tener esta dependencia
import com.google.android.gms.location.*

class PasoService : Service() {

    private lateinit var fusedClient: FusedLocationProviderClient
    private lateinit var callback: LocationCallback
    private var wakeLock: PowerManager.WakeLock? = null
    private val NOTIFICATION_ID = 102
    private var lastUpdateTime: Long = -10000L

    override fun onCreate() {
        super.onCreate()
        Log.d("PasoService", "🚀 Servicio creado (Esperando onStartCommand)")
        
        fusedClient = LocationServices.getFusedLocationProviderClient(this)
        
        callback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                // EL FILTRO DEBE IR AQUÍ DENTRO
                val currentTime = System.currentTimeMillis()
                
                if (currentTime - lastUpdateTime < 8000L) {
                    return 
                }
                
                // Si pasa el filtro, actualizamos el tiempo
                lastUpdateTime = currentTime

                // Procesamos las ubicaciones
                result.locations.forEach { loc ->
                    MyServicePlugin.instance?.sendLocationToJS(loc)
                    MyForegroundService.instance?.evaluateLocation(loc.longitude, loc.latitude)
                    Log.d("PasoService", "📍 GPS Procesado: ${loc.latitude}, ${loc.longitude}")
                }
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d("PasoService", "📲 onStartCommand recibido")

        // 1. Iniciamos Foreground inmediatamente para cumplir con la promesa del sistema
        startForegroundServiceSafe()
        
        // 2. Iniciamos el WakeLock aquí, no en onCreate
        if (wakeLock == null) {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "PasoApp::GPSTrackerLock")
            wakeLock?.acquire(10 * 60 * 60 * 1000L)
        }

        // 3. Iniciamos GPS
        startLocationUpdates()

        return START_STICKY
    }

    private fun startForegroundServiceSafe() {
        val notification = createNotification()
        
        try {
            if (Build.VERSION.SDK_INT >= 34) { // Android 14 y 15
                // IMPORTANTE: Si no necesitas subir archivos pesados en este instante,
                // intenta iniciar SOLO con LOCATION primero para ganar la batalla al sistema.
                ServiceCompat.startForeground(
                    this, 
                    NOTIFICATION_ID, 
                    notification, 
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
                )
                Log.d("PasoService", "✅ Foreground iniciado con éxito (Tipo Location)")
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } catch (e: Exception) {
            Log.e("PasoService", "❌ Error Crítico: ${e.message}")
            // Si entra aquí, es que el sistema bloqueó el inicio por políticas de Background
        }
    }

    private fun startLocationUpdates() {
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5000L)
            .setMinUpdateIntervalMillis(2000L)
            .build()

        try {
            fusedClient.requestLocationUpdates(request, callback, Looper.getMainLooper())
        } catch (unlikely: SecurityException) {
            Log.e("PasoService", "❌ Sin permisos de GPS: $unlikely")
        }
    }

    override fun onDestroy() {
        if (wakeLock?.isHeld == true) wakeLock?.release()
        fusedClient.removeLocationUpdates(callback)
        Log.d("PasoService", "🛑 GPS detenido")
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotification(): Notification {
        val channelId = "paso_gps_channel"
        val manager = getSystemService(NotificationManager::class.java)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(channelId, "Paso GPS Service", NotificationManager.IMPORTANCE_LOW)
            manager?.createNotificationChannel(channel)
        }

        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, launchIntent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, channelId)
            .setContentTitle("Seguimiento de Ruta")
            .setContentText("Paso está registrando tu ubicación")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }
}