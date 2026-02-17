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

  @objc var onProgressChange: RCTDirectEventBlock?

  private var navigationViewController: NavigationViewController?
  private var pendingIndexedRouteResponse: IndexedRouteResponse?
  private var lastRouteSignature: String?
  private var routeRequestId: Int = 0
  private var currentAccessToken: String?

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
    guard let handler = onProgressChange else { return }
    var payload: [String: Any] = [
      "latitude": location.coordinate.latitude,
      "longitude": location.coordinate.longitude,
      "distanceRemaining": progress.distanceRemaining,
      "durationRemaining": progress.durationRemaining,
      "fractionTraveled": progress.fractionTraveled,
      "distanceToInstruction": progress.currentLegProgress.currentStepProgress.distanceRemaining,
    ]
    if let instruction = progress.currentLegProgress.currentStepProgress.currentVisualInstruction?.primaryInstruction.text {
      payload["instruction"] = instruction
    }
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
