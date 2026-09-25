import 'package:dio/dio.dart';
import 'api_client.dart';

/// Miroir de POST /devices/enroll (voir devices/devices.controller.ts côté
/// backend). Appelé UNIQUEMENT pendant une session CHEF_EQUIPE/MAIRE — voir
/// EnrollmentScreen : c'est le superviseur qui autorise l'enrôlement, jamais
/// l'agent lui-même, mais la paire de clés est générée SUR LE DEVICE, et seule
/// la clé publique quitte l'appareil.
class DevicesApi {
  const DevicesApi();

  Future<String> enroll({required String agentId, required String publicKeySpkiBase64}) async {
    try {
      final response = await ApiClient.instance.dio.post(
        '/devices/enroll',
        data: {'agentId': agentId, 'publicKey': publicKeySpkiBase64},
      );
      return (response.data as Map<String, dynamic>)['id'] as String;
    } on DioException catch (e) {
      throw ApiException.fromDioError(e);
    }
  }
}
