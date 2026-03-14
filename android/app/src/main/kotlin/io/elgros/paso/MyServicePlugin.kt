package io.elgros.paso

import android.content.Intent
import android.location.Location
import android.os.Build
import android.os.PowerManager
import android.util.Log
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod // 👈 ESTE ES EL ÚNICO QUE VALE
import com.getcapacitor.annotation.CapacitorPlugin
import android.content.Context

@CapacitorPlugin(name = "MyService")
class MyServicePlugin : Plugin() {

    companion object {
        var instance: MyServicePlugin? = null
    }

    override fun load() {
        super.load()
        instance = this
    }

    @PluginMethod
    fun startService(call: PluginCall) {
        try {
            val intent = Intent(context, PasoService::class.java).apply {
                action = PasoService.ACTION_START
            }
            ContextCompat.startForegroundService(context, intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject(e.message)
        }
    }

    @PluginMethod
    fun setReferenceTrack(call: PluginCall) {
        val coordsArray = call.getArray("coordinates")
        if (coordsArray == null) return call.reject("No coordinates")

        val flatCoords = DoubleArray(coordsArray.length() * 2).apply {
            for (i in 0 until coordsArray.length()) {
                val point = coordsArray.getJSONArray(i)
                this[i * 2] = point.getDouble(0)
                this[i * 2 + 1] = point.getDouble(1)
            }
        }

        val intent = Intent(context, PasoService::class.java).apply {
            action = PasoService.ACTION_UPDATE_TRACK
            putExtra("coords", flatCoords)
        }
        context.startService(intent)
        call.resolve()
    }

    @PluginMethod
    fun stopService(call: PluginCall) {
        context.stopService(Intent(context, PasoService::class.java))
        call.resolve()
    }

    fun sendLocationToJS(loc: Location) {
        val isSimulatedValue = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            loc.isMock
        } else {
            @Suppress("DEPRECATION") 
            loc.isFromMockProvider
        }

        val data = JSObject().apply {
            put("latitude", loc.latitude)
            put("longitude", loc.longitude)
            put("accuracy", loc.accuracy)
            put("altitude", loc.altitude)
            
            if (Build.VERSION.SDK_INT >= 34 && loc.hasMslAltitude()) {
                put("altitude", loc.mslAltitudeMeters)
                put("isMSL", true) // Avisamos a Angular que ya está corregida
                put("altitudeAccuracy", loc.mslAltitudeAccuracyMeters)
            } else {
                put("altitude", loc.altitude)
                put("isMSL", false) // Angular deberá aplicar el GeoidService si quiere
                
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    put("altitudeAccuracy", loc.verticalAccuracyMeters)
                } else {
                    put("altitudeAccuracy", 0.0)
                }
            }            

            put("bearing", loc.bearing)
            put("speed", loc.speed)
            put("time", loc.time.toDouble()) 
            put("simulated", isSimulatedValue)
        }
        
        Log.d("Paso", "Enviando a JS -> Lat: ${loc.latitude}, Spd: ${loc.speed}, Sim: $isSimulatedValue")
        notifyListeners("location", data)
    }

    fun notifyStatusToJS(status: String, matchIndex: Int) {
        val data = JSObject().apply { 
            put("status", status)
            put("matchIndex", matchIndex) 
        }
        notifyListeners("routeStatusUpdate", data)
    }

    @PluginMethod
    fun isIgnoringBatteryOptimizations(call: PluginCall) {
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val isIgnoring = pm.isIgnoringBatteryOptimizations(context.packageName)
        call.resolve(JSObject().put("value", isIgnoring))
    }

    // 🚀 AQUÍ ESTABA EL ERROR. AHORA ES @PluginMethod
    @PluginMethod
    fun updateSharingConfig(call: PluginCall) {
        val isSharing = call.getBoolean("isSharing") ?: false
        
        val intent = Intent(context, PasoService::class.java).apply {
            action = "ACTION_UPDATE_SHARING"
            putExtra("isSharing", isSharing)
            
            if (isSharing) {
                putExtra("shareToken", call.getString("shareToken"))
                putExtra("deviceId", call.getString("deviceId"))
                putExtra("supabaseUrl", call.getString("supabaseUrl"))
                putExtra("supabaseKey", call.getString("supabaseKey"))
            }
        }
        
        context.startService(intent)
        call.resolve()
    }
}