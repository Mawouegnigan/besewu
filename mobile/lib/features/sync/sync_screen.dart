import 'package:flutter/material.dart';
import '../../data/local/app_database.dart';
import '../../data/repositories/transaction_repository.dart';

/// Synchronisation manuelle (déclenchée par l'agent) — pas de sync automatique
/// en tâche de fond dans ce squelette (à ajouter avec `workmanager` ou
/// équivalent pour une vraie synchro périodique en arrière-plan).
class SyncScreen extends StatefulWidget {
  const SyncScreen({super.key, required this.database});
  final AppDatabase database;

  @override
  State<SyncScreen> createState() => _SyncScreenState();
}

class _SyncScreenState extends State<SyncScreen> {
  late final TransactionRepository _repository = TransactionRepository(widget.database);
  bool _loading = false;
  SyncSummary? _summary;
  String? _error;

  Future<void> _sync() async {
    setState(() {
      _loading = true;
      _error = null;
      _summary = null;
    });
    try {
      final summary = await _repository.syncPending();
      setState(() => _summary = summary);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Synchronisation')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            FilledButton(
              onPressed: _loading ? null : _sync,
              child: _loading
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Synchroniser maintenant'),
            ),
            const SizedBox(height: 24),
            if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
            if (_summary != null) ...[
              if (_summary!.total == 0)
                const Text('Rien à synchroniser — tout est déjà envoyé.')
              else ...[
                Text('Acceptées : ${_summary!.accepted}'),
                Text('Déjà connues (doublons) : ${_summary!.duplicate}'),
                Text('Signalées (dérive d’horloge) : ${_summary!.flagged}',
                    style: TextStyle(color: _summary!.flagged > 0 ? Colors.orange : null)),
                Text('Rejetées : ${_summary!.rejected}',
                    style: TextStyle(color: _summary!.rejected > 0 ? Colors.red : null)),
                if (_summary!.rejected > 0)
                  const Padding(
                    padding: EdgeInsets.only(top: 8),
                    child: Text(
                      'Une transaction rejetée signale un problème sérieux '
                      '(signature invalide ou device bloqué) — contactez la mairie, '
                      'ne réessayez pas simplement.',
                      style: TextStyle(color: Colors.red),
                    ),
                  ),
              ],
            ],
          ],
        ),
      ),
    );
  }
}
