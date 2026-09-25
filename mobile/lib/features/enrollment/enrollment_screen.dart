import 'package:flutter/material.dart';
import '../../core/api/devices_api.dart';
import '../../core/crypto/ed25519_key_service.dart';

/// Écran d'enrôlement d'un NOUVEAU device pour un agent.
///
/// Utilisé lors de la remise physique du terminal : un CHEF_EQUIPE ou la MAIRE
/// se connecte sur CE téléphone avec SA PROPRE session (pas de deviceId requis
/// pour son rôle), ouvre cet écran, saisit l'id de l'agent qui va recevoir le
/// terminal, puis :
///   1. Le device génère lui-même sa paire de clés Ed25519 (jamais le serveur,
///      jamais un autre appareil — section 3, Option B de la revue critique).
///   2. Seule la clé PUBLIQUE est envoyée à `POST /devices/enroll`.
///   3. Une fois le device créé côté serveur (id renvoyé), la clé privée est
///      persistée localement, associée à ce deviceId.
///   4. Le superviseur se déconnecte ; l'agent peut alors se connecter sur ce
///      même terminal, qui est désormais son device enrôlé.
///
/// LIMITE CONNUE : cet écran demande l'id de l'agent en saisie libre (UUID) —
/// le backend n'expose pas encore d'endpoint de liste des utilisateurs pour en
/// proposer un sélecteur. À ajouter (GET /users, réservé MAIRE) avant un usage
/// réel sur le terrain.
class EnrollmentScreen extends StatefulWidget {
  const EnrollmentScreen({super.key});

  @override
  State<EnrollmentScreen> createState() => _EnrollmentScreenState();
}

class _EnrollmentScreenState extends State<EnrollmentScreen> {
  final _agentIdController = TextEditingController();
  bool _loading = false;
  String? _error;
  String? _successDeviceId;

  Future<void> _enroll() async {
    setState(() {
      _loading = true;
      _error = null;
      _successDeviceId = null;
    });

    try {
      final agentId = _agentIdController.text.trim();
      if (agentId.isEmpty) {
        throw StateError('Identifiant agent requis.');
      }

      final generated = await Ed25519KeyService.instance.generateKeyPair();

      final deviceId = await const DevicesApi().enroll(
        agentId: agentId,
        publicKeySpkiBase64: generated.publicKeySpkiBase64,
      );

      await Ed25519KeyService.instance.persistKeyPair(
        deviceId: deviceId,
        privateKeyBase64: generated.privateKeyBase64,
      );

      setState(() => _successDeviceId = deviceId);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Enrôler ce terminal')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Ce terminal va générer sa propre clé de signature. '
              'Assurez-vous de le remettre à l’agent concerné juste après.',
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _agentIdController,
              decoration: const InputDecoration(
                labelText: 'Identifiant (UUID) de l’agent',
                hintText: 'ex. 8e72b813-8d49-46b5-9aaf-c0dc0ef27370',
              ),
            ),
            const SizedBox(height: 16),
            if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
            if (_successDeviceId != null)
              Text(
                'Device enrôlé avec succès (id: $_successDeviceId). '
                'Déconnectez-vous et laissez l’agent se connecter.',
                style: const TextStyle(color: Colors.green),
              ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _loading ? null : _enroll,
              child: _loading
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Générer la clé et enrôler'),
            ),
          ],
        ),
      ),
    );
  }
}
