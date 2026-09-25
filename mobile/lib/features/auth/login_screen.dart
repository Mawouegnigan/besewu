import 'package:flutter/material.dart';
import '../../core/api/auth_api.dart';
import '../../core/storage/secure_storage_service.dart';
import '../home/home_screen.dart';

/// Écran de connexion unique pour tous les rôles. Le comportement diffère
/// selon le rôle renvoyé par le backend (voir README > Authentification) :
///  - AGENT : un deviceId local est requis. S'il est absent, l'agent ne peut
///    pas se connecter et doit passer par un superviseur pour l'enrôlement.
///  - Autres rôles : connexion directe, aucun deviceId nécessaire.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _usernameController = TextEditingController();
  final _pinController = TextEditingController();
  bool _loading = false;
  String? _error;

  Future<void> _submit() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final deviceId = await SecureStorageService.instance.getDeviceId();

      final result = await const AuthApi().login(
        username: _usernameController.text.trim(),
        pin: _pinController.text.trim(),
        deviceId: deviceId,
      );

      await SecureStorageService.instance.saveSession(
        accessToken: result.accessToken,
        username: result.username,
        role: result.role,
      );

      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const HomeScreen()),
      );
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 400),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'Besewu',
                    style: TextStyle(fontSize: 32, fontWeight: FontWeight.bold),
                  ),
                  const Text('Collecte des taxes municipales'),
                  const SizedBox(height: 32),
                  TextField(
                    controller: _usernameController,
                    decoration: const InputDecoration(labelText: 'Identifiant'),
                    textInputAction: TextInputAction.next,
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _pinController,
                    decoration: const InputDecoration(labelText: 'Code PIN'),
                    keyboardType: TextInputType.number,
                    obscureText: true,
                    maxLength: 8,
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => _submit(),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 8),
                    Text(_error!, style: const TextStyle(color: Colors.red)),
                  ],
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: _loading ? null : _submit,
                      child: _loading
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Se connecter'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
