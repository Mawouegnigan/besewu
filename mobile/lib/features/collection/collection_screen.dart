import 'package:flutter/material.dart';
import '../../core/constants.dart';
import '../../data/local/app_database.dart';
import '../../data/repositories/transaction_repository.dart';

/// "Encaisser en 2 clics" (cahier des charges original, section 3.1) : un bouton
/// de montant prédéfini, puis une confirmation — rien de plus. Fonctionne
/// entièrement hors-ligne (voir TransactionRepository.collect).
class CollectionScreen extends StatefulWidget {
  const CollectionScreen({super.key, required this.database});
  final AppDatabase database;

  @override
  State<CollectionScreen> createState() => _CollectionScreenState();
}

class _CollectionScreenState extends State<CollectionScreen> {
  late final TransactionRepository _repository = TransactionRepository(widget.database);
  bool _loading = false;
  String? _lastResultMessage;
  String? _error;

  Future<void> _collect(int amount) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirmer l’encaissement'),
        content: Text('Encaisser $amount FCFA pour place de marché ?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Confirmer')),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() {
      _loading = true;
      _error = null;
      _lastResultMessage = null;
    });

    try {
      final result = await _repository.collect(amount: amount, taxType: 'place_marche');
      setState(() {
        _lastResultMessage =
            'Ticket enregistré localement (${result.transactionId.substring(0, 8)}…). '
            'Impression Bluetooth non implémentée dans ce squelette — voir README.';
      });
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Encaisser')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            const Text(
              'Sélectionnez le montant — la géolocalisation est capturée '
              'automatiquement (obligatoire, anti-fraude).',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            Wrap(
              spacing: 16,
              runSpacing: 16,
              alignment: WrapAlignment.center,
              children: AppConfig.predefinedAmounts
                  .map(
                    (amount) => SizedBox(
                      width: 140,
                      height: 100,
                      child: FilledButton(
                        onPressed: _loading ? null : () => _collect(amount),
                        child: Text('$amount FCFA', style: const TextStyle(fontSize: 20)),
                      ),
                    ),
                  )
                  .toList(),
            ),
            const SizedBox(height: 24),
            if (_loading) const CircularProgressIndicator(),
            if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
            if (_lastResultMessage != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Text(
                  _lastResultMessage!,
                  style: const TextStyle(color: Colors.green),
                  textAlign: TextAlign.center,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
