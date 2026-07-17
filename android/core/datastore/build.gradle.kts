plugins { id("pjsk.android.library"); id("pjsk.android.hilt") }
android { namespace = "com.pjsktools.core.datastore" }
dependencies {
    implementation(project(":core:model"))
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.kotlinx.coroutines.android)
}
