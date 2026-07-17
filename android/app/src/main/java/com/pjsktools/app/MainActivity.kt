package com.pjsktools.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.pjsktools.app.ui.PjskToolsApp
import com.pjsktools.app.ui.AppViewModel
import com.pjsktools.core.designsystem.PjskToolsTheme
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val viewModel: AppViewModel = hiltViewModel()
            val state by viewModel.state.collectAsState()
            PjskToolsTheme(state.themeMode) {
                PjskToolsApp(viewModel)
            }
        }
    }
}
