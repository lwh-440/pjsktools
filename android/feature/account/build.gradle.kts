plugins { id("pjsk.android.library"); id("pjsk.android.compose"); id("pjsk.android.hilt") }
android { namespace = "com.pjsktools.feature.account" }
dependencies {
    implementation(project(":core:model"))
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons)
    implementation(libs.androidx.hilt.navigation.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
}
