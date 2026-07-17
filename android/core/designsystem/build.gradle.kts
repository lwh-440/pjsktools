plugins { id("pjsk.android.library"); id("pjsk.android.compose") }
android { namespace = "com.pjsktools.core.designsystem" }
dependencies {
    implementation(project(":core:model"))
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons)
    implementation(libs.coil.compose)
    testImplementation(libs.junit)
}
