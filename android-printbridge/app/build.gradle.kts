plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.getqueuedrop.printbridge"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.getqueuedrop.printbridge"
        minSdk = 26
        targetSdk = 36
        versionCode = 10
        versionName = "1.1.1"
    }

    buildTypes {
        getByName("debug") {
            applicationIdSuffix = ".test"
            versionNameSuffix = "-test"
            manifestPlaceholders["appLabel"] = "QueueDrop TEST"
            buildConfigField("boolean", "TEST_ONLY", "true")
        }
        getByName("release") {
            manifestPlaceholders["appLabel"] = "QueueDrop"
            buildConfigField("boolean", "TEST_ONLY", "false")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        viewBinding = true
        buildConfig = true
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.4")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("com.squareup.okhttp3:okhttp:5.1.0")
    implementation("com.google.zxing:core:3.5.3")
}
