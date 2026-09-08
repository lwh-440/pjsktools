package com.pjsktools.core.designsystem

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pjsktools.core.model.ThemeMode

val SekaiTeal = Color(0xFF00A7A5)
val SekaiTealDark = Color(0xFF007F82)
val SekaiPink = Color(0xFFE84C8B)
val SekaiYellow = Color(0xFFF1C84B)
val SekaiInk = Color(0xFF18212B)
val SekaiSurfaceSoft = Color(0xFFF5F8FA)

private val LightColors = lightColorScheme(
    primary = SekaiTealDark,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD2F3F1),
    onPrimaryContainer = Color(0xFF003737),
    secondary = SekaiPink,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFFFD9E6),
    onSecondaryContainer = Color(0xFF5B1234),
    tertiary = Color(0xFF8A6B00),
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFFFFECA6),
    onTertiaryContainer = Color(0xFF2B2100),
    background = SekaiSurfaceSoft,
    onBackground = SekaiInk,
    surface = Color.White,
    onSurface = SekaiInk,
    surfaceDim = Color(0xFFE8F0F3),
    surfaceBright = Color.White,
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color(0xFFF8FBFC),
    surfaceContainer = Color(0xFFF0F5F7),
    surfaceContainerHigh = Color(0xFFEAF1F4),
    surfaceContainerHighest = Color(0xFFE3ECEF),
    surfaceVariant = Color(0xFFEAF0F3),
    onSurfaceVariant = Color(0xFF53616C),
    outline = Color(0xFF9EADB6),
    outlineVariant = Color(0xFFD1DCE2),
    error = Color(0xFFBA1A1A)
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF67D8D4),
    onPrimary = Color(0xFF003736),
    primaryContainer = Color(0xFF00504F),
    onPrimaryContainer = Color(0xFF8FF5F0),
    secondary = Color(0xFFFFAFCD),
    onSecondary = Color(0xFF620A37),
    secondaryContainer = Color(0xFF81264E),
    onSecondaryContainer = Color(0xFFFFD9E6),
    tertiary = Color(0xFFFFDF74),
    onTertiary = Color(0xFF3C2F00),
    background = Color(0xFF10181D),
    onBackground = Color(0xFFE2EAF0),
    surface = Color(0xFF17252B),
    onSurface = Color(0xFFE2EAF0),
    surfaceDim = Color(0xFF10181D),
    surfaceBright = Color(0xFF2E3D44),
    surfaceContainerLowest = Color(0xFF0D1418),
    surfaceContainerLow = Color(0xFF151F24),
    surfaceContainer = Color(0xFF1B292F),
    surfaceContainerHigh = Color(0xFF223238),
    surfaceContainerHighest = Color(0xFF2A3B42),
    surfaceVariant = Color(0xFF26363D),
    onSurfaceVariant = Color(0xFFBBC8CE),
    outline = Color(0xFF89969D),
    outlineVariant = Color(0xFF394950)
)

private val SekaiShapes = Shapes(
    extraSmall = androidx.compose.foundation.shape.RoundedCornerShape(4.dp),
    small = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
    medium = androidx.compose.foundation.shape.RoundedCornerShape(10.dp),
    large = androidx.compose.foundation.shape.RoundedCornerShape(12.dp),
    extraLarge = androidx.compose.foundation.shape.RoundedCornerShape(16.dp)
)

private val BaseTypography = Typography()
private val SekaiTypography = Typography(
    displayLarge = BaseTypography.displayLarge.copy(fontWeight = FontWeight.Bold),
    displayMedium = BaseTypography.displayMedium.copy(fontWeight = FontWeight.Bold),
    displaySmall = BaseTypography.displaySmall.copy(fontWeight = FontWeight.Bold),
    headlineLarge = BaseTypography.headlineLarge.copy(fontSize = 32.sp, lineHeight = 40.sp, fontWeight = FontWeight.Bold),
    headlineMedium = BaseTypography.headlineMedium.copy(fontSize = 28.sp, lineHeight = 36.sp, fontWeight = FontWeight.Bold),
    headlineSmall = BaseTypography.headlineSmall.copy(fontSize = 24.sp, lineHeight = 32.sp, fontWeight = FontWeight.Bold),
    titleLarge = BaseTypography.titleLarge.copy(fontSize = 18.sp, lineHeight = 26.sp, fontWeight = FontWeight.Bold),
    titleMedium = BaseTypography.titleMedium.copy(fontSize = 16.sp, lineHeight = 24.sp, fontWeight = FontWeight.SemiBold),
    titleSmall = BaseTypography.titleSmall.copy(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold),
    labelLarge = BaseTypography.labelLarge.copy(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Bold),
    labelMedium = BaseTypography.labelMedium.copy(fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.SemiBold),
    labelSmall = BaseTypography.labelSmall.copy(fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = BaseTypography.bodyLarge.copy(fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = BaseTypography.bodyMedium.copy(fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = BaseTypography.bodySmall.copy(fontSize = 12.sp, lineHeight = 18.sp)
)

@Composable
fun PjskToolsTheme(mode: ThemeMode = ThemeMode.SYSTEM, content: @Composable () -> Unit) {
    val dark = when (mode) { ThemeMode.SYSTEM -> isSystemInDarkTheme(); ThemeMode.LIGHT -> false; ThemeMode.DARK -> true }
    MaterialTheme(
        colorScheme = if (dark) DarkColors else LightColors,
        typography = SekaiTypography,
        shapes = SekaiShapes,
        content = content
    )
}
