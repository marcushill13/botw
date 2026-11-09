package com.botw.data;

import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class PrizeCandidate
{
	private String itemName;
	private String category;
	private String rsn;
	private long occurredAt;
}
