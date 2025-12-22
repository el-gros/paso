package io.elgros.paso

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.*

class PasoService : Service() {

    private lateinit var fusedClient: FusedLocationProviderClient
    private lateinit var callback: LocationCallback
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        Log.d("PasoService", "🚀 Service created")

        // 1. ADQUIRIR WAKELOCK (CPU siempre activa)
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "PasoApp::WakeLockTag"
        ).apply {
            acquire() // Mantiene la CPU encendida incluso con pantalla apagada
        }

        fusedClient = LocationServices.getFusedLocationProviderClient(this)

        callback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                result.locations.forEach { loc ->
                    // Enviamos los datos completos al Plugin
                    PasoPlugin.instance?.sendLocationToJS(loc)
                    Log.d("PasoService", "📍 GPS Full Data sent: ${loc.latitude}, ${loc.longitude}")
                }
            }
        }

        // Usamos tu ID 101 y tu función de notificación mejorada
        startForeground(101, createNotification())
        startLocationUpdates()
    }

    private fun startLocationUpdates() {
        val request = LocationRequest.Builder(
            Priority.PRIORITY_HIGH_ACCURACY,
            5000L 
        )
            .setMinUpdateIntervalMillis(2000L)
            .build()

        try {
            fusedClient.requestLocationUpdates(
                request,
                callback,
                Looper.getMainLooper()
            )
        } catch (unlikely: SecurityException) {
            Log.e("PasoService", "Lost location permission. $unlikely")
        }
    }

    override fun onDestroy() {
        // 2. LIBERAR WAKELOCK (Vital para no gastar batería después de parar)
        if (wakeLock?.isHeld == true) {
            wakeLock?.release()
        }
        
        fusedClient.removeLocationUpdates(callback)
        Log.d("PasoService", "🛑 Service and WakeLock destroyed")
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotification(): Notification {
        val channelId = "paso_tracking"
        val manager = getSystemService(NotificationManager::class.java)

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Paso Tracking",
                NotificationManager.IMPORTANCE_LOW
            )
            manager?.createNotificationChannel(channel)
        }

        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, launchIntent, PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, channelId)
            .setContentTitle("Paso en ejecución")
            .setContentText("Tu ubicación se está sincronizando...")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(pendingIntent)
            .setOngoing(true) 
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
}