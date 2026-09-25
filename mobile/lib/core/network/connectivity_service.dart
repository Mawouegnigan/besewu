import 'package:connectivity_plus/connectivity_plus.dart';

/// Détecte si le device a une connexion réseau exploitable, pour déclencher une
/// synchronisation automatique (ou simplement l'autoriser dans l'UI). Ne
/// garantit pas que l'API est joignable (réseau ≠ accès effectif au backend) —
/// le vrai test reste l'appel API lui-même, qui échoue proprement sinon.
class ConnectivityService {
  const ConnectivityService();

  Future<bool> hasNetwork() async {
    final results = await Connectivity().checkConnectivity();
    return !results.contains(ConnectivityResult.none);
  }

  Stream<bool> onConnectivityChanged() {
    return Connectivity().onConnectivityChanged.map(
          (results) => !results.contains(ConnectivityResult.none),
        );
  }
}
