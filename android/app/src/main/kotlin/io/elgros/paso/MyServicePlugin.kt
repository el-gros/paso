package io.elgros.paso

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import androidx.core.content.ContextCompat
import android.content.ComponentName
import io.elgros.paso.MyForegroundService

@CapacitorPlugin(name = "MyService")
class MyServicePlugin : Plugin() {

    init {
        Log.e("PasoPlugin", "🔥 MyServicePlugin CLASS LOADED 🔥")
    }

override fun load() {
    super.load()
    Log.e("PasoApp", ">>> MyServicePlugin.load() CALLED <<<")
}

init {
    Log.d("PasoApp", "MyServicePlugin instance created and initialized!")
}

@PluginMethod
fun startService(call: PluginCall) {
  // 1. Define the intent
  Log.d("PLUGIN_DEBUG", "MyServicePlugin.startService called 1")

  val context = bridge.activity?.applicationContext ?: run {
    call.reject("Activity is null")
    return
  }

  val intent = Intent(context, MyForegroundService::class.java).apply {
    action = MyForegroundService.ACTION_START_FOREGROUND_SERVICE
  }

  // 2. Use ContextCompat to handle startForegroundService safely
  ContextCompat.startForegroundService(context, intent)

  Log.d("PLUGIN_DEBUG", "MyServicePlugin.startService called 2")
  call.resolve()
}

    @PluginMethod
    fun stopService(call: PluginCall) {
        val ctx = context
        val intent = Intent(ctx, MyForegroundService::class.java)
        ctx.stopService(intent)

        Log.d("PLUGIN_DEBUG", "MyServicePlugin.stopService called")
        call.resolve()
    }

    @PluginMethod
    fun isXiaomi(call: PluginCall) {
        val manufacturer = android.os.Build.MANUFACTURER
        val isXiaomi = manufacturer.equals("Xiaomi", ignoreCase = true)
        val ret = JSObject()
        ret.put("value", isXiaomi)
        call.resolve(ret)
    }

    @PluginMethod
    fun openAutostartSettings(call: PluginCall) {
        try {
            val intent = Intent()
            intent.component = ComponentName(
                "com.miui.securitycenter",
                "com.miui.permcenter.autostart.AutoStartManagementActivity"
            )
            context.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            // Si no es MIUI o la actividad cambió de nombre, abrimos ajustes generales
            try {
                val intent = Intent(Settings.ACTION_SETTINGS)
                context.startActivity(intent)
                call.resolve()
            } catch (ex: Exception) {
                call.reject("No se pudo abrir la configuración")
            }
        }
    }

    @PluginMethod
    fun openBatteryOptimization(call: PluginCall) {
        val packageName = context.packageName

        // Intento 1: Abrir el diálogo directo de "Permitir"
        // Requiere <uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />
        try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:$packageName")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            call.resolve()
            return
        } catch (e: Exception) {
            Log.e("PasoPlugin", "Fallo Intento 1 (Directo): ${e.message}")
        }

        // Intento 2: Abrir la lista general de optimización (Fallback)
        try {
            val intentFallback = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intentFallback)
            call.resolve()
        } catch (e: Exception) {
            Log.e("PasoPlugin", "Fallo Intento 2 (Ajustes): ${e.message}")
            call.reject("No se pudo abrir ningún ajuste de batería")
        }
    }
}
