plugins {
    `groovy-gradle-plugin`
}

repositories {
    google()
    mavenCentral()
    gradlePluginPortal()
}

dependencies {
    implementation("com.android.tools.build:gradle:8.5.2")
    implementation("org.jetbrains.kotlin:kotlin-gradle-plugin:2.0.21")
    implementation("org.jetbrains.kotlin:compose-compiler-gradle-plugin:2.0.21")
    implementation("com.google.devtools.ksp:symbol-processing-gradle-plugin:2.0.21-1.0.28")
    implementation("com.google.dagger:hilt-android-gradle-plugin:2.52")
}
