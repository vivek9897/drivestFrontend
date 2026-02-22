package com.drivest.app.navigation

import android.content.Intent
import com.drivest.navigation.AppFlow
import com.drivest.navigation.CentrePickerActivity
import com.drivest.navigation.DestinationSearchActivity
import com.drivest.navigation.HomeActivity
import com.drivest.navigation.MainActivity
import com.drivest.navigation.NavigationEntryActivity
import com.drivest.navigation.PracticeEntryActivity
import com.drivest.navigation.PracticeRoutesActivity
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

class DrivestNativeFlowModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "DrivestNativeFlow"

  @ReactMethod
  fun open(options: ReadableMap?, promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("E_NO_ACTIVITY", "No foreground activity available")
      return
    }

    val screen = options?.getString("screen")?.trim()?.lowercase() ?: "practice"
    val centreId = options?.getString("centreId")?.trim().orEmpty()
    val routeId = options?.getString("routeId")?.trim().orEmpty()
    val destinationName = options?.getString("destinationName")
    val destinationLat =
      if (options?.hasKey("destinationLat") == true) options.getDouble("destinationLat") else null
    val destinationLon =
      if (options?.hasKey("destinationLon") == true) options.getDouble("destinationLon") else null

    val intent = when (screen) {
      "home" -> Intent(activity, HomeActivity::class.java)
      "practice-entry" -> Intent(activity, PracticeEntryActivity::class.java)
      "navigation-entry" -> Intent(activity, NavigationEntryActivity::class.java)
      "centre-picker" -> Intent(activity, CentrePickerActivity::class.java)
      "practice-routes" -> Intent(activity, PracticeRoutesActivity::class.java)
      "destination-search", "navigation" -> Intent(activity, DestinationSearchActivity::class.java)
      "main" -> Intent(activity, MainActivity::class.java)
      "practice" -> Intent(activity, PracticeEntryActivity::class.java)
      else -> Intent(activity, PracticeEntryActivity::class.java)
    }

    // Optional direct deep-link into the native navigation map screen.
    if (screen == "main") {
      if (centreId.isNotEmpty()) intent.putExtra(AppFlow.EXTRA_CENTRE_ID, centreId)
      if (routeId.isNotEmpty()) intent.putExtra(AppFlow.EXTRA_ROUTE_ID, routeId)
      when {
        destinationLat != null && destinationLon != null -> {
          intent.putExtra(AppFlow.EXTRA_APP_MODE, AppFlow.MODE_NAV)
          intent.putExtra(AppFlow.EXTRA_DESTINATION_LAT, destinationLat)
          intent.putExtra(AppFlow.EXTRA_DESTINATION_LON, destinationLon)
          if (!destinationName.isNullOrBlank()) {
            intent.putExtra(AppFlow.EXTRA_DESTINATION_NAME, destinationName)
          }
        }
        else -> {
          intent.putExtra(AppFlow.EXTRA_APP_MODE, AppFlow.MODE_PRACTICE)
        }
      }
    } else if (centreId.isNotEmpty()) {
      intent.putExtra(AppFlow.EXTRA_CENTRE_ID, centreId)
    }

    activity.startActivity(intent)
    promise.resolve(true)
  }
}
