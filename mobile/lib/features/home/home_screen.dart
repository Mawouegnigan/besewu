import 'package:flutter/material.dart';
import '../../core/storage/secure_storage_service.dart';
import '../../data/local/app_database.dart';
import '../auth/login_screen.dart';
import '../collection/collection_screen.dart';
import '../enrollment/enrollment_screen.dart';
import '../sync/sync_screen.dart';

/// Menu d'accueil, filtré par rôle. Reflète le RBAC backend (voir README du
/// backend, section Rôles) — mais c'est une commodité d'UX, PAS un contrôle de
/// sécurité : le vrai contrôle est fait par le backend sur chaque appel API.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final AppDatabase _database = AppDatabase();
  String? _username;
  String? _role;

  @override
  void initState() {
    super.initState();
    _loadSession();
  }

  Future<void> _loadSession() async {
    final username = await SecureStorageService.instance.getUsername();
    final role = await SecureStorageService.instance.getRole();
    setState(() {
      _username = username;
      _role = role;
    });
  }

  Future<void> _logout() async {
    await SecureStorageService.instance.clearSession();
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
    );
  }

  @override
  void dispose() {
    _database.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isAgent = _role == 'agent';
    final isSupervisor = _role == 'chef_equipe' || _role == 'maire';

    return Scaffold(
      appBar: AppBar(
        title: Text(_username ?? 'Besewu'),
        actions: [
          IconButton(onPressed: _logout, icon: const Icon(Icons.logout)),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_role != null) Chip(label: Text('Rôle : $_role')),
          const SizedBox(height: 16),
          if (isAgent) ...[
            ListTile(
              leading: const Icon(Icons.point_of_sale),
              title: const Text('Encaisser'),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => CollectionScreen(database: _database)),
              ),
            ),
            ListTile(
              leading: const Icon(Icons.sync),
              title: const Text('Synchroniser'),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => SyncScreen(database: _database)),
              ),
            ),
          ],
          if (isSupervisor)
            ListTile(
              leading: const Icon(Icons.phonelink_setup),
              title: const Text('Enrôler ce terminal pour un agent'),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const EnrollmentScreen()),
              ),
            ),
          if (!isAgent && !isSupervisor)
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text(
                'Ce rôle n’a pas encore d’écran dédié dans ce squelette '
                '(receveur, auditeur — à construire : rapprochement de caisse, '
                'consultation du journal d’audit).',
              ),
            ),
        ],
      ),
    );
  }
}
