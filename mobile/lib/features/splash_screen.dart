import 'package:flutter/material.dart';
import '../core/storage/secure_storage_service.dart';
import '../core/constants.dart';
import 'auth/login_screen.dart';
import 'home/home_screen.dart';

/// Premier écran affiché : vérifie s'il existe déjà une session (token JWT) et
/// si le device n'est pas verrouillé pour cause d'absence de synchro prolongée
/// (section 2 de la revue critique — MAX_OFFLINE_HOURS).
///
/// Ce verrouillage local est une défense supplémentaire, PAS un remplacement
/// du contrôle serveur : même si l'app autorise l'accès, chaque appel API est
/// de toute façon revérifié côté backend (device BLOCKED/REVOKED, token expiré).
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _decideNextScreen();
  }

  Future<void> _decideNextScreen() async {
    final token = await SecureStorageService.instance.getAccessToken();
    final lockedOut = await SecureStorageService.instance.isLockedOutForOfflineDuration(
      AppConfig.maxOfflineHours,
    );

    if (!mounted) return;

    if (lockedOut) {
      await SecureStorageService.instance.clearSession();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Terminal verrouillé : plus de ${AppConfig.maxOfflineHours}h sans '
            'synchronisation. Contactez la mairie.',
          ),
          duration: const Duration(seconds: 6),
        ),
      );
    }

    final destination = (token != null && !lockedOut) ? const HomeScreen() : const LoginScreen();

    Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => destination));
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(child: CircularProgressIndicator()),
    );
  }
}
