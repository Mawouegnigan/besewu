import 'package:dio/dio.dart';
import 'api_client.dart';

class SyncItemOutcome {
  SyncItemOutcome({required this.id, required this.outcome});
  final String id;
  final String outcome; // 'accepted' | 'duplicate' | 'flagged' | 'rejected_signature' | 'rejected_device'
}

/// Miroir de PATCH /transactions/sync (voir transactions.controller.ts /
/// transactions.service.ts côté backend). Chaque item doit déjà contenir la
/// signature Ed25519 calculée localement (voir Ed25519KeyService).
class TransactionsApi {
  const TransactionsApi();

  Future<List<SyncItemOutcome>> sync(List<Map<String, dynamic>> transactions) async {
    try {
      final response = await ApiClient.instance.dio.patch(
        '/transactions/sync',
        data: {'transactions': transactions},
      );
      final list = response.data as List<dynamic>;
      return list
          .map((e) => SyncItemOutcome(
                id: e['id'] as String,
                outcome: e['outcome'] as String,
              ))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDioError(e);
    }
  }
}
