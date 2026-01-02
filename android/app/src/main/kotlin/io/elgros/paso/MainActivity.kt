package io.elgros.paso

import android.os.Bundle
import android.util.Log
import com.getcapacitor.BridgeActivity
import io.elgros.paso.MyServicePlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(MyServicePlugin::class.java)
        super.onCreate(savedInstanceState) // Llamamos al super primero
               
        Log.e("PasoApp", ">>> MainActivity onCreate HAS RUN. <<<")
    }
}