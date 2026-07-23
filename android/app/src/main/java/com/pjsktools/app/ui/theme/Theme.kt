package com.pjsktools.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import com.pjsktools.core.designsystem.PjskToolsTheme as DesignSystemTheme
import com.pjsktools.core.model.ThemeMode

@Composable
fun PjskToolsTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    DesignSystemTheme(
        mode = if (darkTheme) ThemeMode.DARK else ThemeMode.LIGHT,
        content = content
    )
}
