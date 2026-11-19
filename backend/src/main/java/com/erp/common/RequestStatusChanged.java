package com.erp.common;

/**
 * Événement publié à la création d'une demande (status = PENDING) et à chaque transition.
 * Le module notification l'écoutera pour envoyer les mails (spec §4).
 * <p>
 * Il est publié <b>pendant</b> la transaction : un écouteur qui a un effet externe (mail…) doit utiliser
 * {@code @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)}, jamais {@code @EventListener}, sinon
 * un mail partirait pour une transaction annulée (ex. approbation refusée en 409).
 */
public record RequestStatusChanged(Kind kind, Long requestId, Long userId, RequestStatus status, String adminComment) {

	public enum Kind {

		OVERTIME, ABSENCE

	}

}
