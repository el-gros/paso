package io.elgros.paso.plugins

import com.getcapacitor.Plugin
import io.elgros.paso.MyServicePlugin

class MyServicePluginPackage {
    fun getPlugins(): List<Class<out Plugin>> {
        return listOf(
            MyServicePlugin::class.java
        )
    }
}
