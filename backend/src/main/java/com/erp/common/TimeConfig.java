package com.erp.common;

import java.time.Clock;
import java.time.ZoneId;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Horloge de l'application, au fuseau Europe/Paris (convention backend) : « aujourd'hui » ne dépend pas du fuseau du
 * serveur. Injectée là où une règle métier dépend de la date du jour, et fixée dans les tests.
 */
@Configuration
public class TimeConfig {

	public static final ZoneId PARIS = ZoneId.of("Europe/Paris");

	@Bean
	Clock clock() {
		return Clock.system(PARIS);
	}

}
