import Foundation
import UIKit
import CoreLocation
import React
import MapboxDirections
import MapboxNavigation
import MapboxCoreNavigation
import MapboxMaps

@objc(DrivestNavigationView)
class DrivestNavigationView: UIView, NavigationViewControllerDelegate {
  private let turnZoomPrepThresholdM: CLLocationDistance = 260
  private let turnZoomFarThresholdM: CLLocationDistance = 120
  private let turnZoomNearThresholdM: CLLocationDistance = 40
  private let turnZoomFar: CGFloat = 18.20
  private let turnZoomNear: CGFloat = 18.90
  private let straightZoomSlow: CGFloat = 17.85
  private let straightZoomFast: CGFloat = 17.35
  private let straightZoomFastSpeedMps: CLLocationSpeed = 31.0
  private let followingZoomMin: CGFloat = 17.2
  private let followingZoomMax: CGFloat = 19.0
  private let followingZoomSmoothing: CGFloat = 0.35

  @objc var origin: NSArray = [] {
    didSet { requestRouteIfReady() }
  }

  @objc var destination: NSArray = [] {
    didSet { requestRouteIfReady() }
  }

  @objc var destinationName: NSString? {
    didSet { requestRouteIfReady() }
  }

  @objc var waypoints: NSArray = [] {
    didSet { requestRouteIfReady() }
  }

  @objc var shouldSimulateRoute: Bool = false {
    didSet { applySettings() }
  }

  @objc var isMuted: Bool = false {
    didSet { NavigationSettings.shared.voiceMuted = isMuted }
  }

  @objc var rerouteEnabled: Bool = true {
    didSet { applyRerouteSettings() }
  }

  @objc var accessToken: NSString? {
    didSet {
      configureAccessTokenIfNeeded()
      requestRouteIfReady()
    }
  }

  @objc var styleURL: NSString? {
    didSet { applyStyleIfNeeded() }
  }

  @objc var navigationMode: NSString? {
    didSet { applySettings() }
  }

  @objc var routeCoordinates: NSArray = [] {
    didSet { requestRouteIfReady() }
  }

  @objc var onProgressChange: RCTDirectEventBlock?

  private var navigationViewController: NavigationViewController?
  private var pendingIndexedRouteResponse: IndexedRouteResponse?
  private var lastRouteSignature: String?
  private var routeRequestId: Int = 0
  private var currentAccessToken: String?
  private var activeFollowingZoomOverride: CGFloat?

  override func layoutSubviews() {
    super.layoutSubviews()
    navigationViewController?.view.frame = bounds
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      detachNavigation()
    } else {
      attachPendingNavigationIfNeeded()
      requestRouteIfReady()
    }
  }

  func navigationViewControllerDidDismiss(_ navigationViewController: NavigationViewController, byCanceling canceled: Bool) {
    // no-op
  }

  func navigationViewController(_ navigationViewController: NavigationViewController,
                                didUpdate progress: RouteProgress,
                                with location: CLLocation,
                                rawLocation: CLLocation) {
    updateFollowCameraForActiveNavigation(progress: progress, location: location)
    guard let handler = onProgressChange else { return }
    let stepProgress = progress.currentLegProgress.currentStepProgress
    let visualInstruction = stepProgress.currentVisualInstruction
    let primaryInstruction = sanitizeForUi(visualInstruction?.primaryInstruction.text)
    let secondaryInstruction = sanitizeForUi(visualInstruction?.secondaryInstruction?.text)
    let maneuverType = stepProgress.currentStep.maneuverType?.rawValue.lowercased()
    let maneuverModifier = inferManeuverModifier(from: primaryInstruction)

    var payload: [String: Any] = [
      "latitude": location.coordinate.latitude,
      "longitude": location.coordinate.longitude,
      "distanceRemaining": progress.distanceRemaining,
      "durationRemaining": progress.durationRemaining,
      "fractionTraveled": progress.fractionTraveled,
      "distanceToInstruction": stepProgress.distanceRemaining,
      "nativeMode": (navigationMode as String?)?.uppercased() ?? "UNKNOWN",
      "nativeFallbackBannerVisible": false,
    ]
    if let primaryInstruction {
      payload["instruction"] = primaryInstruction
    }
    if let secondaryInstruction {
      payload["instructionSecondary"] = secondaryInstruction
    }
    if let maneuverType, !maneuverType.isEmpty {
      payload["maneuverType"] = maneuverType
    }
    if let maneuverModifier, !maneuverModifier.isEmpty {
      payload["maneuverModifier"] = maneuverModifier
    }
    appendNativeUiTelemetry(into: &payload, controller: navigationViewController)
    handler(payload)
  }

  private func requestRouteIfReady() {
    configureAccessTokenIfNeeded()
    if NavigationSettings.shared.directions.credentials.accessToken.isEmpty {
      return
    }
    guard let coordinates = buildCoordinates(), coordinates.count >= 2 else { return }
    let destinationLabel = destinationName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let signature = "\(coordinates.map { "\($0.latitude),\($0.longitude)" }.joined(separator: ";"))|\(destinationLabel)"
    if signature == lastRouteSignature { return }
    lastRouteSignature = signature

    let routeOptions = buildRouteOptions(for: coordinates)
    routeOptions.includesSteps = true
    routeOptions.includesSpokenInstructions = true
    routeOptions.includesVisualInstructions = true

    let requestId = routeRequestId + 1
    routeRequestId = requestId
    NavigationSettings.shared.directions.calculate(routeOptions) { [weak self] (_, result) in
      guard let self = self else { return }
      guard requestId == self.routeRequestId else { return }
      switch result {
      case .failure:
        return
      case .success(let response):
        let indexed = IndexedRouteResponse(routeResponse: response, routeIndex: 0)
        if self.window == nil {
          self.pendingIndexedRouteResponse = indexed
          return
        }
        self.applyRoute(indexedRouteResponse: indexed)
      }
    }
  }

  private func applyRoute(indexedRouteResponse: IndexedRouteResponse) {
    let simulationMode: SimulationMode = shouldSimulateRoute ? .always : .onPoorGPS
    let navigationService = MapboxNavigationService(
      indexedRouteResponse: indexedRouteResponse,
      credentials: NavigationSettings.shared.directions.credentials,
      simulating: simulationMode
    )
    let navigationOptions = NavigationOptions(navigationService: navigationService)
    let navViewController = NavigationViewController(for: indexedRouteResponse, navigationOptions: navigationOptions)
    navViewController.delegate = self
    attachNavigationController(navViewController)
    applySettings()
    applyStyleIfNeeded()
  }

  private func attachPendingNavigationIfNeeded() {
    guard navigationViewController == nil, let pending = pendingIndexedRouteResponse else { return }
    pendingIndexedRouteResponse = nil
    applyRoute(indexedRouteResponse: pending)
  }

  private func attachNavigationController(_ controller: NavigationViewController) {
    guard let parent = findParentViewController() else { return }
    detachNavigation()
    navigationViewController = controller
    parent.addChild(controller)
    controller.view.frame = bounds
    controller.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(controller.view)
    controller.didMove(toParent: parent)
    applyRerouteSettings()
    applyStyleIfNeeded()
  }

  private func detachNavigation() {
    guard let controller = navigationViewController else { return }
    controller.willMove(toParent: nil)
    controller.navigationService?.stop()
    controller.view.removeFromSuperview()
    controller.removeFromParent()
    navigationViewController = nil
  }

  private func applySettings() {
    navigationViewController?.navigationService?.simulationMode = shouldSimulateRoute ? .always : .onPoorGPS
    NavigationSettings.shared.voiceMuted = isMuted
    if ((navigationMode as String?)?.uppercased() == "PREVIEW") {
      activeFollowingZoomOverride = nil
    }
    applyStyleIfNeeded()
    applyRerouteSettings()
  }

  private func applyRerouteSettings() {
    guard let router = navigationViewController?.navigationService?.router else { return }
    router.reroutesProactively = rerouteEnabled
    router.refreshesRoute = rerouteEnabled
  }

  private func configureAccessTokenIfNeeded() {
    let infoToken = Bundle.main.object(forInfoDictionaryKey: "MBXAccessToken") as? String
    let rawToken = (accessToken as String?) ?? infoToken
    let tokenValue = rawToken?.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let tokenValue, !tokenValue.isEmpty else { return }
    if tokenValue == currentAccessToken { return }
    currentAccessToken = tokenValue
    ResourceOptionsManager.default.resourceOptions.accessToken = tokenValue
    let credentials = Credentials(accessToken: tokenValue)
    let directions = Directions(credentials: credentials)
    NavigationSettings.shared.initialize(with: .init(directions: directions))
  }

  private func buildCoordinates() -> [CLLocationCoordinate2D]? {
    let mode = (navigationMode as String?)?.uppercased()
    let precomputedRoute = parseRouteCoordinates(routeCoordinates)
    if mode == "PREVIEW", precomputedRoute.count >= 2 {
      return dedupeCoordinates(precomputedRoute)
    }
    guard let originCoord = parseCoordinate(origin),
          let destinationCoord = parseCoordinate(destination) else { return nil }
    var coords = [originCoord]
    coords.append(contentsOf: parseWaypointCoordinates(waypoints))
    coords.append(destinationCoord)
    return dedupeCoordinates(coords)
  }

  private func buildRouteOptions(for coordinates: [CLLocationCoordinate2D]) -> NavigationRouteOptions {
    let name = destinationName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !name.isEmpty else {
      return NavigationRouteOptions(coordinates: coordinates, profileIdentifier: .automobileAvoidingTraffic)
    }

    var waypointObjects = coordinates.map { Waypoint(coordinate: $0) }
    waypointObjects[waypointObjects.count - 1].name = name
    return NavigationRouteOptions(waypoints: waypointObjects, profileIdentifier: .automobileAvoidingTraffic)
  }

  private func parseWaypointCoordinates(_ value: NSArray) -> [CLLocationCoordinate2D] {
    var coords: [CLLocationCoordinate2D] = []
    for entry in value {
      if let coord = parseCoordinate(entry as AnyObject) {
        coords.append(coord)
      }
    }
    return coords
  }

  private func parseRouteCoordinates(_ value: NSArray) -> [CLLocationCoordinate2D] {
    var coords: [CLLocationCoordinate2D] = []
    for entry in value {
      if let coord = parseCoordinate(entry as AnyObject) {
        coords.append(coord)
      }
    }
    return coords
  }

  private func parseCoordinate(_ value: Any?) -> CLLocationCoordinate2D? {
    guard let array = value as? NSArray, array.count >= 2 else { return nil }
    guard let lon = array[0] as? NSNumber, let lat = array[1] as? NSNumber else { return nil }
    return CLLocationCoordinate2D(latitude: lat.doubleValue, longitude: lon.doubleValue)
  }

  private func dedupeCoordinates(_ coordinates: [CLLocationCoordinate2D]) -> [CLLocationCoordinate2D] {
    guard let first = coordinates.first else { return [] }
    var result = [first]
    for coord in coordinates.dropFirst() {
      if isSameCoordinate(result.last, coord) { continue }
      result.append(coord)
    }
    return result
  }

  private func isSameCoordinate(_ lhs: CLLocationCoordinate2D?, _ rhs: CLLocationCoordinate2D) -> Bool {
    guard let lhs = lhs else { return false }
    return abs(lhs.latitude - rhs.latitude) < 1e-6 && abs(lhs.longitude - rhs.longitude) < 1e-6
  }

  private func applyStyleIfNeeded() {
    guard let rawStyle = styleURL as String? else { return }
    let style = rawStyle.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !style.isEmpty else { return }
    resolveEmbeddedMapView()?.mapboxMap.loadStyleURI(style)
  }

  private func updateFollowCameraForActiveNavigation(progress: RouteProgress, location: CLLocation) {
    let mode = (navigationMode as String?)?.uppercased()
    guard mode == "TO_START" || mode == "ON_ROUTE" else { return }

    let mapView = resolveEmbeddedMapView()
    guard let mapView else { return }

    let distanceToManeuver = progress.currentLegProgress.currentStepProgress.distanceRemaining
    let maneuverType = progress.currentLegProgress.currentStepProgress.currentStep.maneuverType?.rawValue.lowercased() ?? ""
    let maneuverDirection = progress.currentLegProgress.currentStepProgress.currentVisualInstruction?.primaryInstruction.text?.lowercased() ?? ""
    let speedMps = max(location.speed, 0)
    let targetZoom = computeTargetFollowZoom(
      distanceToManeuver: distanceToManeuver,
      maneuverType: maneuverType,
      maneuverDirection: maneuverDirection,
      speedMps: speedMps
    )
    let smoothed = activeFollowingZoomOverride.map { lerp($0, targetZoom, followingZoomSmoothing) } ?? targetZoom
    activeFollowingZoomOverride = min(max(smoothed, followingZoomMin), followingZoomMax)

    let course = location.course >= 0 ? location.course : mapView.mapboxMap.cameraState.bearing
    let h = max(bounds.height, 1)
    let topPadding = max(360, h * 0.68)
    let bottomPadding = max(90, h * 0.10)
    var cameraOptions = CameraOptions(center: location.coordinate)
    cameraOptions.padding = UIEdgeInsets(top: topPadding, left: 36, bottom: bottomPadding, right: 36)
    cameraOptions.zoom = activeFollowingZoomOverride
    cameraOptions.bearing = course
    cameraOptions.pitch = 52
    mapView.mapboxMap.setCamera(to: cameraOptions)
  }

  private func resolveEmbeddedMapView() -> MapView? {
    guard let root = navigationViewController?.view else { return nil }
    return findMapView(in: root)
  }

  private func findMapView(in root: UIView) -> MapView? {
    if let mapView = root as? MapView {
      return mapView
    }
    for child in root.subviews {
      if let found = findMapView(in: child) {
        return found
      }
    }
    return nil
  }

  private func computeTargetFollowZoom(
    distanceToManeuver: CLLocationDistance,
    maneuverType: String,
    maneuverDirection: String,
    speedMps: CLLocationSpeed
  ) -> CGFloat {
    let straightZoom = computeStraightCruiseZoom(speedMps: speedMps)
    let isTurnLike =
      maneuverType.contains("turn") ||
      maneuverType.contains("roundabout") ||
      maneuverType.contains("rotary") ||
      maneuverType.contains("fork") ||
      maneuverType.contains("merge") ||
      maneuverType.contains("exit") ||
      maneuverType.contains("off_ramp") ||
      maneuverType.contains("uturn") ||
      (maneuverType.isEmpty && (maneuverDirection.contains("left") || maneuverDirection.contains("right") || maneuverDirection.contains("uturn")))
    if !isTurnLike || !distanceToManeuver.isFinite {
      return straightZoom
    }
    if distanceToManeuver > turnZoomPrepThresholdM {
      return straightZoom
    }
    if distanceToManeuver <= turnZoomNearThresholdM {
      return turnZoomNear
    }
    if distanceToManeuver <= turnZoomFarThresholdM {
      let t = CGFloat((distanceToManeuver - turnZoomNearThresholdM) / (turnZoomFarThresholdM - turnZoomNearThresholdM))
      return lerp(turnZoomNear, turnZoomFar, max(0, min(1, t)))
    }
    let t = CGFloat((distanceToManeuver - turnZoomFarThresholdM) / (turnZoomPrepThresholdM - turnZoomFarThresholdM))
    return lerp(turnZoomFar, straightZoom, max(0, min(1, t)))
  }

  private func computeStraightCruiseZoom(speedMps: CLLocationSpeed) -> CGFloat {
    let normalized = CGFloat(max(0, min(1, speedMps / straightZoomFastSpeedMps)))
    return lerp(straightZoomSlow, straightZoomFast, normalized)
  }

  private func lerp(_ from: CGFloat, _ to: CGFloat, _ t: CGFloat) -> CGFloat {
    let clamped = max(0, min(1, t))
    return from + ((to - from) * clamped)
  }

  private func sanitizeForUi(_ value: String?) -> String? {
    guard var normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines), !normalized.isEmpty else {
      return nil
    }
    normalized = normalized.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
    if normalized.caseInsensitiveCompare("undefined") == .orderedSame { return nil }
    if normalized.caseInsensitiveCompare("null") == .orderedSame { return nil }
    return normalized.isEmpty ? nil : normalized
  }

  private func inferManeuverModifier(from instruction: String?) -> String? {
    guard let raw = instruction?.lowercased(), !raw.isEmpty else { return nil }
    if raw.contains("u-turn") || raw.contains("uturn") {
      return "uturn"
    }
    if raw.contains("slight left") {
      return "slight left"
    }
    if raw.contains("slight right") {
      return "slight right"
    }
    if raw.contains("sharp left") {
      return "sharp left"
    }
    if raw.contains("sharp right") {
      return "sharp right"
    }
    if raw.contains("left") {
      return "left"
    }
    if raw.contains("right") {
      return "right"
    }
    if raw.contains("straight") || raw.contains("continue") {
      return "straight"
    }
    return nil
  }

  private func appendNativeUiTelemetry(into payload: inout [String: Any], controller: NavigationViewController) {
    let topBanner = resolveNativeBannerView(
      from: controller,
      keys: ["topBanner", "topBannerViewController", "topBannerContainerView"]
    )
    let bottomBanner = resolveNativeBannerView(
      from: controller,
      keys: ["bottomBanner", "bottomBannerViewController", "bottomBannerContainerView"]
    )
    let topSize = topBanner?.bounds.size ?? .zero
    let bottomSize = bottomBanner?.bounds.size ?? .zero
    let topActuallyVisible = isActuallyVisibleOnScreen(topBanner, in: controller.view)
    let bottomActuallyVisible = isActuallyVisibleOnScreen(bottomBanner, in: controller.view)

    payload["nativeBannerVisible"] = topBanner != nil
    payload["nativeBannerActuallyVisible"] = topActuallyVisible
    payload["nativeBannerWidth"] = Int(topSize.width.rounded())
    payload["nativeBannerHeight"] = Int(topSize.height.rounded())
    payload["nativeBannerChildCount"] = topBanner?.subviews.count ?? 0
    payload["nativeTripVisible"] = bottomBanner != nil
    payload["nativeTripActuallyVisible"] = bottomActuallyVisible
    payload["nativeTripWidth"] = Int(bottomSize.width.rounded())
    payload["nativeTripHeight"] = Int(bottomSize.height.rounded())
    payload["nativeRootWidth"] = Int(bounds.width.rounded())
    payload["nativeRootHeight"] = Int(bounds.height.rounded())
    payload["nativeManeuverCount"] = topBanner == nil ? 0 : 1
  }

  private func resolveNativeBannerView(from controller: NavigationViewController, keys: [String]) -> UIView? {
    for key in keys {
      let selector = NSSelectorFromString(key)
      guard controller.responds(to: selector) else { continue }
      guard let value = controller.value(forKey: key) else { continue }
      if let bannerView = value as? UIView {
        return bannerView
      }
      if let bannerController = value as? UIViewController {
        return bannerController.view
      }
    }
    let expectsTopBanner = keys.contains { $0.lowercased().contains("top") }
    return findBannerView(in: controller.view, expectsTopBanner: expectsTopBanner)
  }

  private func findBannerView(in root: UIView, expectsTopBanner: Bool) -> UIView? {
    let className = String(describing: type(of: root)).lowercased()
    let matchesTop =
      className.contains("instructionbanner") ||
      className.contains("maneuver") ||
      className.contains("topbanner")
    let matchesBottom =
      className.contains("tripprogress") ||
      className.contains("bottombanner") ||
      className.contains("tripbanner")

    if expectsTopBanner && matchesTop {
      return root
    }
    if !expectsTopBanner && matchesBottom {
      return root
    }

    for child in root.subviews {
      if let found = findBannerView(in: child, expectsTopBanner: expectsTopBanner) {
        return found
      }
    }
    return nil
  }

  private func isActuallyVisibleOnScreen(_ view: UIView?, in root: UIView) -> Bool {
    guard let view else { return false }
    guard !view.isHidden, view.alpha > 0.01 else { return false }
    guard view.bounds.width > 0, view.bounds.height > 0 else { return false }
    guard let window = root.window ?? view.window else { return false }
    let frameInWindow = view.convert(view.bounds, to: window)
    guard !frameInWindow.isNull, !frameInWindow.isInfinite else { return false }
    return frameInWindow.intersects(window.bounds.insetBy(dx: 0, dy: 0))
  }

  private func findParentViewController() -> UIViewController? {
    var responder: UIResponder? = self
    while responder != nil {
      if let controller = responder as? UIViewController {
        return controller
      }
      responder = responder?.next
    }
    return nil
  }
}
