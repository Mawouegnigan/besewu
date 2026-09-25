import 'package:dio/dio.dart';
import 'api_client.dart';

class LoginResult {
  LoginResult({required this.accessToken, required this.username, required this.role});
  final String accessToken;
  final String username;
  final String role;
}

/// Miroir de POST /auth/login (voir auth/auth.controller.ts côté backend).
/// `deviceId` n'est requis que pour le rôle AGENT — voir le commentaire dans
/// AuthService.login côté backend (bug corrigé : les autres rôles n'ont pas de
/// notion de "device" dans ce système).
class AuthApi {
  const AuthApi();

  Future<LoginResult> login({
    required String username,
    required String pin,
    String? deviceId,
  }) async {
    try {
      final response = await ApiClient.instance.dio.post(
        '/auth/login',
        data: {
          'username': username,
          'pin': pin,
          if (deviceId != null) 'deviceId': deviceId,
        },
      );
      final data = response.data as Map<String, dynamic>;
      final user = data['user'] as Map<String, dynamic>;
      return LoginResult(
        accessToken: data['accessToken'] as String,
        username: user['username'] as String,
        role: user['role'] as String,
      );
    } on DioException catch (e) {
      throw ApiException.fromDioError(e);
    }
  }
}
