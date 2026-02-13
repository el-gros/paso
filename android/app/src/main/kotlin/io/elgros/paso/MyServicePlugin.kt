package io.elgros.paso

import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.util.Log
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import android.location.Location
import android.os.Build
import android.content.Context  
import android.os.PowerManager  

@CapacitorPlugin(name = "PasoServicePlugin") 
class MyServicePlugin : Plugin() {

    companion object {
        var instance: MyServicePlugin? = null
    }

    override fun load() {
        super.load()
        instance = this
        Log.d("PasoApp", "✅ MyServicePlugin cargado")
    }

    @PluginMethod
    fun setReferenceTrack(call: PluginCall) {
        val coordsArray = call.getArray("coordinates")
        
        val flatCoords = if (coordsArray != null && coordsArray.length() > 0) {
            DoubleArray(coordsArray.length() * 2).apply {
                for (i in 0 until coordsArray.length()) {
                    val point = coordsArray.getJSONArray(i)
                    this[i * 2] = point.getDouble(0)     // Lon
                    this[i * 2 + 1] = point.getDouble(1) // Lat
                }
            }
        } else { null }

        val intent = Intent(context, MyForegroundService::class.java).apply {
            action = MyForegroundService.ACTION_UPDATE_REFERENCE_TRACK
            putExtra("coords", flatCoords)
        }
        
        // Usar startService para actualizaciones de datos, no necesita startForegroundService
        context.startService(intent)
        call.resolve()
    }

    /**
     * Inicia los servicios: Cerebro y GPS con protección para Android 14/15
     */
    @PluginMethod
    fun startService(call: PluginCall) {
        val context = bridge.activity?.applicationContext ?: run {
            call.reject("Activity is null")
            return
        }

        try {
            // 1. Iniciar MyForegroundService (Cerebro)
            val brainIntent = Intent(context, MyForegroundService::class.java).apply {
                action = MyForegroundService.ACTION_START_FOREGROUND_SERVICE
                // Flag para asegurar que el sistema priorice esta intención
                addFlags(Intent.FLAG_FROM_BACKGROUND) 
            }
            ContextCompat.startForegroundService(context, brainIntent)
            Log.d("PasoApp", "🧠 Iniciando Cerebro...")

            // 2. Iniciar PasoService (GPS)
            // Agregamos un pequeño delay de 100ms o lo lanzamos justo después
            val gpsIntent = Intent(context, PasoService::class.java).apply {
                addFlags(Intent.FLAG_FROM_BACKGROUND)
            }
            ContextCompat.startForegroundService(context, gpsIntent)
            Log.d("PasoApp", "🛰️ Iniciando GPS...")

            call.resolve()
        } catch (e: Exception) {
            Log.e("PasoApp", "❌ Error al lanzar servicios: ${e.message}")
            call.reject("Error al iniciar servicios nativos: ${e.message}")
        }
    }

    @PluginMethod
    fun stopService(call: PluginCall) {
        val ctx = context
        ctx.stopService(Intent(ctx, MyForegroundService::class.java))
        ctx.stopService(Intent(ctx, PasoService::class.java))
        call.resolve()
    }

    fun sendLocationToJS(loc: Location) {
        val data = JSObject().apply {
            put("latitude", loc.latitude)
            put("longitude", loc.longitude)
            put("accuracy", loc.accuracy)
            put("altitude", loc.altitude)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                put("altitudeAccuracy", loc.verticalAccuracyMeters)
            } else {
                put("altitudeAccuracy", 0.0)
            }
            put("bearing", loc.bearing)
            put("speed", loc.speed)
            put("time", loc.time)
            
            val isSimulated = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                loc.isMock
            } else {
                @Suppress("DEPRECATION") loc.isFromMockProvider
            }
            put("simulated", isSimulated)
        }
        notifyListeners("location", data)
    }

    // --- MÉTODOS XIAOMI / OPTIMIZACIÓN ---

    @PluginMethod
    fun openBatteryOptimization(call: PluginCall) {
        val packageName = context.packageName
        val intent = Intent().apply {
            action = Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
            data = Uri.parse("package:$packageName")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try {
            context.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            // Fallback a la lista general si el diálogo directo falla
            val intentFallback = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intentFallback)
            call.resolve()
        }
    }

    @PluginMethod
    fun isIgnoringBatteryOptimizations(call: PluginCall) {
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val isIgnoring = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pm.isIgnoringBatteryOptimizations(context.packageName)
        } else {
            true
        }
        val ret = JSObject()
        ret.put("value", isIgnoring)
        call.resolve(ret)
    }
    
    /**
     * Envía el estado de la ruta (green/red) de forma continua al JS.
     * Es llamado desde MyForegroundService cada vez que se evalúa una posición.
     */
    fun notifyStatusToJS(status: String) {
        val data = JSObject().apply {
            put("status", status)
        }
        notifyListeners("routeStatusUpdate", data)
    }
}