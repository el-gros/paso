package io.elgros.paso

import android.util.Log
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.Handler
import android.os.Looper
import androidx.core.app.NotificationCompat
import android.graphics.Color
import io.elgros.paso.R 

class MyForegroundService : Service() {

    // --- VARIABLES PARA EL TRABAJO EN SEGUNDO PLANO ---
    private val handler = Handler(Looper.getMainLooper())
    private val heartbeatRunnable = object : Runnable {
        override fun run() {
            // Este es el código que se ejecutará cada 10 segundos
            Log.d("PasoService", "❤️ HEARTBEAT: Seguimiento activo en segundo plano...")
            
            // Aquí es donde más adelante añadiremos la captura de GPS
            
            handler.postDelayed(this, 10000) // Re-programar
        }
    }

    companion object {
        const val ACTION_START_FOREGROUND_SERVICE = "ACTION_START_FOREGROUND_SERVICE"
        const val ACTION_STOP_FOREGROUND_SERVICE = "ACTION_STOP_FOREGROUND_SERVICE"
        const val CHANNEL_ID = "gps_sync_channel"
        const val NOTIFICATION_ID = 101
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        Log.d("FGS_DEBUG", "Foreground Service creado.")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_FOREGROUND_SERVICE -> {
                startForegroundService()
                // INICIAR EL BUCLE AL ARRANCAR
                handler.removeCallbacks(heartbeatRunnable)
                handler.post(heartbeatRunnable)
            }
            ACTION_STOP_FOREGROUND_SERVICE -> {
                stopSelf()
            }
        }
        return START_STICKY
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            if (manager?.getNotificationChannel(CHANNEL_ID) == null) {
                val serviceChannel = NotificationChannel(
                    CHANNEL_ID,
                    "Location & Sync Service",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Mantiene la app activa para sincronización y GPS"
                    enableLights(true)
                    lightColor = Color.BLUE
                    enableVibration(false)
                    setShowBadge(false)
                }
                manager?.createNotificationChannel(serviceChannel)
            }
        }
    }

    private fun startForegroundService() {
        val notificationIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, notificationIntent, PendingIntent.FLAG_IMMUTABLE
        )

        val stopIntent = Intent(this, MyForegroundService::class.java).apply {
            action = ACTION_STOP_FOREGROUND_SERVICE
        }
        val stopPendingIntent = PendingIntent.getService(
            this, 1, stopIntent, PendingIntent.FLAG_IMMUTABLE
        )

        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("App Paso Activa")
            .setContentText("Sincronizando datos y GPS...")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE) // Ayuda a la prioridad en Android
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Detener", stopPendingIntent)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION or ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        Log.d("FGS_DEBUG", "Foreground Service en primer plano con notificación.")
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        // DETENER EL BUCLE AL DESTRUIR EL SERVICIO
        handler.removeCallbacks(heartbeatRunnable)
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            stopForeground(true)
        }
        
        Log.d("FGS_DEBUG", "Servicio destruido y bucle detenido.")
        super.onDestroy()
    }
}