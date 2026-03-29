(async () => {
	if (!getPageStatus().access) return;

	type OwnedItemKey = "xanax" | "ecstasy" | "eroticDvds";

	const OWNED_ITEM_META: Record<OwnedItemKey, { label: string }> = {
		xanax: {
			label: "Xanax",
		},
		ecstasy: {
			label: "Ecstasy",
		},
		eroticDvds: {
			label: "Erotic DVDs",
		},
	};

	let panelContent: HTMLElement | undefined;
	const manualOwnedFallbacks: Record<OwnedItemKey, string> = {
		xanax: "",
		ecstasy: "",
		eroticDvds: "",
	};

	featureManager.registerFeature(
		"Happy Jump Cash Planner",
		"stocks",
		() => settings.pages.stocks.happyJumpCashPlanner,
		null,
		initialize,
		teardown,
		{
			storage: [
				"settings.pages.stocks.happyJumpCashPlanner",
				"userdata.money",
				"userdata.networth",
				"userdata.stocks",
				"userdata.date",
				"torndata.itemsMap",
			],
		},
		async () => {
			await checkDevice();

			if (!hasAPIData()) return "No API access.";

			return true;
		}
	);

	async function initialize() {
		await requireElement("#stockmarketroot h4");
		if (findContainer("Happy Jump Cash Planner")) return;

		const target = document.querySelector("#stockmarketroot h4") || document.querySelector("#stockmarketroot");
		if (!target) return;

		const { content } = createContainer("Happy Jump Cash Planner", {
			previousElement: target,
			compact: true,
			class: "mt10",
		});

		panelContent = content;
		render();
	}

	function teardown() {
		panelContent = undefined;
		removeContainer("Happy Jump Cash Planner");
	}

	function render() {
		if (!panelContent) return;
		panelContent.innerHTML = "";

		const wrapper = elementBuilder({ type: "div", class: "tt-hjcp" });

		wrapper.appendChild(renderFinancialSection());
		wrapper.appendChild(renderOwnedItemsSection());

		panelContent.appendChild(wrapper);
	}

	function renderFinancialSection() {
		const snapshot = getFinancialSnapshot();

		const section = elementBuilder({ type: "div", class: "tt-hjcp-section" });

		section.appendChild(
			elementBuilder({
				type: "div",
				class: "tt-hjcp-section__head",
				children: [
					elementBuilder({
						type: "div",
						class: "tt-hjcp-section__intro",
						children: [
							elementBuilder({
								type: "div",
								class: "tt-hjcp-section__title",
								text: "Auto-loaded financial snapshot",
							}),
							elementBuilder({
								type: "div",
								class: "tt-hjcp-section__subtitle",
								text: "Current cash and portfolio values load immediately. Happy jump and allocation math comes in later patches.",
							}),
						],
					}),
					elementBuilder({
						type: "button",
						class: "tt-hjcp-button",
						text: "Refresh panel",
						attributes: { type: "button" },
						events: {
							click: () => render(),
						},
					}),
				],
			})
		);

		const grid = elementBuilder({ type: "div", class: "tt-hjcp-grid" });

		grid.appendChild(statCard("Available cash", formatMoney(snapshot.availableCash)));
		grid.appendChild(statCard("Cash on hand", formatMoney(snapshot.cashOnHand)));
		grid.appendChild(statCard("Vault cash", formatMoney(snapshot.vaultCash)));
		grid.appendChild(statCard("Bank invested", formatMoney(snapshot.bankInvested)));
		grid.appendChild(statCard("Networth", formatMoney(snapshot.networth)));
		grid.appendChild(statCard("Stock market value", formatMoney(snapshot.stockMarketValue)));
		grid.appendChild(statCard("Stock positions tracked", formatInteger(snapshot.stockPositions)));
		grid.appendChild(statCard("Total shares held", formatInteger(snapshot.totalSharesHeld)));

		section.appendChild(grid);

		section.appendChild(
			elementBuilder({
				type: "div",
				class: "tt-hjcp-section__foot",
				children: [
					elementBuilder({
						type: "div",
						class: "tt-hjcp-note",
						text: snapshot.updatedLabel,
					}),
					elementBuilder({
						type: "div",
						class: "tt-hjcp-note",
						text: snapshot.sourceLabel,
					}),
				],
			})
		);

		return section;
	}

	function renderOwnedItemsSection() {
		const snapshot = getOwnedItemsSnapshot();

		const section = elementBuilder({ type: "div", class: "tt-hjcp-section" });

		section.appendChild(
			elementBuilder({
				type: "div",
				class: "tt-hjcp-section__intro",
				children: [
					elementBuilder({
						type: "div",
						class: "tt-hjcp-section__title",
						text: "Owned happy jump items",
					}),
					elementBuilder({
						type: "div",
						class: "tt-hjcp-section__subtitle",
						text: "Enter your current Xanax, Ecstasy, and Erotic DVDs manually.",
					}),
				],
			})
		);

		const grid = elementBuilder({ type: "div", class: "tt-hjcp-grid" });

		(Object.keys(OWNED_ITEM_META) as OwnedItemKey[]).forEach((key) => {
			const meta = OWNED_ITEM_META[key];
			const autoCount = snapshot[key];
			const manualCount = parseManualCount(manualOwnedFallbacks[key]);
			const effectiveCount = autoCount !== null ? autoCount : manualCount;

			grid.appendChild(
				elementBuilder({
					type: "div",
					class: "tt-hjcp-card",
					children: [
						elementBuilder({
							type: "div",
							class: "tt-hjcp-card__label",
							text: meta.label,
						}),
						elementBuilder({
							type: "div",
							class: "tt-hjcp-card__value",
							text: effectiveCount === null ? "Unavailable" : formatNumber(effectiveCount),
						}),
						elementBuilder({
							type: "div",
							class: "tt-hjcp-note",
							text: autoCount === null ? "Auto: unavailable" : `Auto: ${formatNumber(autoCount)}`,
						}),
						elementBuilder({
							type: "label",
							class: "tt-hjcp-input-wrap",
							children: [
								elementBuilder({
									type: "span",
									class: "tt-hjcp-input-wrap__label",
									text: "Manual fallback",
								}),
								elementBuilder({
									type: "input",
									class: "tt-hjcp-input",
									attributes: {
										type: "number",
										min: "0",
										step: "1",
										placeholder: autoCount === null ? "Enter amount" : "Only needed if auto fails",
									},
										value: manualOwnedFallbacks[key],
										events: {
											change: (event) => {
												const target = event.currentTarget as HTMLInputElement;
												manualOwnedFallbacks[key] = target.value;
												render();
										},
									},
								}),
							],
						}),
					],
				})
			);
		});

		section.appendChild(grid);

		section.appendChild(
			elementBuilder({
				type: "div",
				class: "tt-hjcp-section__foot",
				children: [
					elementBuilder({
						type: "div",
						class: "tt-hjcp-note",
						text: snapshot.sourceLabel,
					}),
				],
			})
		);

		return section;
	}

	function statCard(label: string, value: string) {
		return elementBuilder({
			type: "div",
			class: "tt-hjcp-card",
			children: [
				elementBuilder({
					type: "div",
					class: "tt-hjcp-card__label",
					text: label,
				}),
				elementBuilder({
					type: "div",
					class: "tt-hjcp-card__value",
					text: value,
				}),
			],
		});
	}

	function getFinancialSnapshot() {
		const currentUserdata = ((typeof userdata !== "undefined" ? userdata : {}) as any) || {};
		const money = currentUserdata.money || {};
		const networth = currentUserdata.networth || {};
		const stocks = currentUserdata.stocks || {};

		const cashOnHand = firstNumber([money.onhand, money.wallet, networth.wallet]);
		const vaultCash = firstNumber([money.vault, networth.vault]);
		const availableCash = sumNumbers([cashOnHand, vaultCash]);
		const bankInvested = firstNumber([money.city_bank?.amount, money.bank?.amount, networth.bank]);
		const networthTotal = firstNumber([networth.total]);
		const stockMarketValue = firstNumber([networth.stockmarket]);

		const stockEntries = Object.values(stocks as Record<string, any>).filter((entry) => typeof entry === "object" && entry !== null);
		const stockPositions = stockEntries.filter((entry) => Number(entry?.total_shares || 0) > 0).length;
		const totalSharesHeld = stockEntries.reduce((sum, entry) => sum + Math.max(0, Number(entry?.total_shares || 0)), 0);

		const updatedAt = Number(currentUserdata.date || 0);

		return {
			cashOnHand,
			vaultCash,
			availableCash,
			bankInvested,
			networth: networthTotal,
			stockMarketValue,
			stockPositions,
			totalSharesHeld,
			updatedLabel: updatedAt > 0 ? `Snapshot updated ${formatTime({ milliseconds: Date.now() - updatedAt }, { type: "ago" })}` : "Snapshot update time unavailable",
			sourceLabel: "Source: cached TornTools userdata (money / networth / stocks)",
		};
	}

	function getOwnedItemsSnapshot(): Record<OwnedItemKey, number | null> & { sourceLabel: string } {
		return {
			xanax: null,
			ecstasy: null,
			eroticDvds: null,
			sourceLabel: "Source: manual input only",
		};
	}

	function firstNumber(values: any[]) {
		for (const value of values) {
			const parsed = Number(value);
			if (isFinite(parsed) && parsed >= 0) return parsed;
		}

		return null;
	}

	function sumNumbers(values: Array<number | null>) {
		const valid = values.filter((value): value is number => typeof value === "number" && isFinite(value) && value >= 0);
		if (!valid.length) return null;

		return valid.reduce((sum, value) => sum + value, 0);
	}

	function parseManualCount(value: string) {
		if (!value.trim()) return null;

		const parsed = Number(value);
		if (!isFinite(parsed) || parsed < 0) return null;

		return Math.floor(parsed);
	}

	function formatMoney(value: number | null) {
		if (value === null) return "Unavailable";
		return formatNumber(value, { currency: true });
	}

	function formatInteger(value: number | null) {
		if (value === null) return "Unavailable";
		return formatNumber(value);
	}
})();
