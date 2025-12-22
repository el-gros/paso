package io.elgros.paso

import android.content.Intent
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "Paso")
class PasoPlugin : Plugin() {

    // 1. Instancia estática para que el PasoService pueda comunicarse aquí
    companion object {
        var instance: PasoPlugin? = null
    }

    override fun load() {
        super.load()
        instance = this // Guardamos la referencia al cargar
        Log.d("PasoPlugin", "🔥 PasoPlugin loaded and instance saved")
    }

    // 2. Función que el Servicio llamará cada vez que obtenga un GPS
    fun sendLocationToJS(loc: android.location.Location) {
        val data = JSObject()
        data.put("latitude", loc.latitude)
        data.put("longitude", loc.longitude)
        data.put("accuracy", loc.accuracy)
        data.put("altitude", loc.altitude)
        // altitudeAccuracy requiere API 26+
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            data.put("altitudeAccuracy", loc.verticalAccuracyMeters)
        } else {
            data.put("altitudeAccuracy", 0.0)
        }
        data.put("bearing", loc.bearing)
        data.put("speed", loc.speed)
        data.put("time", loc.time)
        
        // Detectar si la ubicación es simulada (Mock)
        val isSimulated = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
            loc.isMock
        } else {
            @Suppress("DEPRECATION")
            loc.isFromMockProvider
        }
        data.put("simulated", isSimulated)

        notifyListeners("location", data)
    }

    @PluginMethod
    fun startService(call: PluginCall) {
        val intent = Intent(context, PasoService::class.java)
        // Es buena práctica añadir una acción para que el servicio sepa qué hacer
        intent.action = "START" 
        context.startForegroundService(intent)
        call.resolve()
    }

    @PluginMethod
    fun stopService(call: PluginCall) {
        val intent = Intent(context, PasoService::class.java)
        context.stopService(intent)
        call.resolve()
    }
}