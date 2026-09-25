import 'package:dio/dio.dart';
import '../constants.dart';
import '../storage/secure_storage_service.dart';

/// Client HTTP partagé. Ajoute automatiquement `Authorization: Bearer <token>`
/// sur chaque requête si une session existe — reflète le comportement attendu
/// par `JwtAuthGuard` côté backend (toute route protégée sauf `@Public()`).
class ApiClient {
  ApiClient._internal() {
    _dio = Dio(
      BaseOptions(
        baseUrl: AppConfig.apiBaseUrl,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 15),
      ),
    );

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await SecureStorageService.instance.getAccessToken();
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
      ),
    );
  }

  static final ApiClient instance = ApiClient._internal();
  late final Dio _dio;

  Dio get dio => _dio;
}

/// Erreur API normalisée — évite de faire fuiter les détails Dio/HTTP jusqu'à l'UI.
class ApiException implements Exception {
  ApiException(this.message, {this.statusCode});
  final String message;
  final int? statusCode;

  factory ApiException.fromDioError(DioException e) {
    final status = e.response?.statusCode;
    final body = e.response?.data;
    String message = 'Erreur réseau. Vérifiez votre connexion.';
    if (body is Map && body['message'] != null) {
      final m = body['message'];
      message = m is List ? m.join(', ') : m.toString();
    } else if (status != null) {
      message = 'Erreur serveur ($status).';
    }
    return ApiException(message, statusCode: status);
  }

  @override
  String toString() => message;
}
