plugins { id("pjsk.android.library"); id("pjsk.android.compose"); id("pjsk.android.hilt") }
android { namespace = "com.pjsktools.feature.collections" }
dependencies {
    implementation(project(":core:model")); implementation(project(":core:designsystem"))
    implementation(platform(libs.compose.bom)); implementation(libs.compose.ui); implementation(libs.compose.material3)
    implementation(libs.compose.material.icons); implementation(libs.coil.compose)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.hilt.navigation.compose); implementation(libs.androidx.lifecycle.viewmodel.compose)
}
