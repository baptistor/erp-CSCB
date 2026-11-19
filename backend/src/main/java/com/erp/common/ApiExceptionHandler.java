package com.erp.common;

import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

/** Erreurs métier ({@link ResponseStatusException}) renvoyées directement en ProblemDetail (detail = message). */
@RestControllerAdvice
public class ApiExceptionHandler {

	@ExceptionHandler(ResponseStatusException.class)
	ResponseEntity<ProblemDetail> handle(ResponseStatusException ex) {
		return ResponseEntity.status(ex.getStatusCode()).body(ex.getBody());
	}

}
