plugins { id("pjsk.android.library") }
android { namespace = "com.pjsktools.core.testing" }
dependencies { api(project(":core:model")); api(libs.junit); implementation(libs.kotlinx.coroutines.android) }
