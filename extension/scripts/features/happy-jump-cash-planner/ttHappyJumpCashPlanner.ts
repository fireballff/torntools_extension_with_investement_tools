(async () => {
	if (!getPageStatus().access) return;

	type OwnedItemKey = "xanax" | "ecstasy" | "eroticDvds";

	const OWNED_ITEM_META: Record<OwnedItemKey, { label: string; matchers: string[] }> = {
		xanax: {
			label: "Xanax",
			matchers: ["xanax"],
		},
		ecstasy: {
			label: "Ecstasy",
			matchers: ["ecstasy"],
		},
		eroticDvds: {
			label: "Erotic DVDs",
			matchers: ["erotic dvd", "erotic dvds"],
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
				"userdata.inventory",
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
						text: "Auto-filled from cached inventory when available. If a count cannot be detected, use the manual fallback field for that item.",
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
										input: (event) => {
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
		const currentUserdata = ((typeof userdata !== "undefined" ? userdata : {}) as any) || {};
		const inventory = currentUserdata.inventory;

		if (!inventory) {
			return {
				xanax: null,
				ecstasy: null,
				eroticDvds: null,
				sourceLabel: "Source: cached inventory unavailable in current userdata snapshot",
			};
		}

		return {
			xanax: findOwnedItemCount(inventory, OWNED_ITEM_META.xanax.matchers),
			ecstasy: findOwnedItemCount(inventory, OWNED_ITEM_META.ecstasy.matchers),
			eroticDvds: findOwnedItemCount(inventory, OWNED_ITEM_META.eroticDvds.matchers),
			sourceLabel: "Source: cached TornTools userdata inventory when available",
		};
	}

	function findOwnedItemCount(inventory: any, matchers: string[]) {
		const normalizedMatchers = matchers.map((matcher) => matcher.toLowerCase());
		let total = 0;
		let found = false;

		const items = normalizeInventoryEntries(inventory);

		items.forEach((item) => {
			const name = getInventoryItemName(item).toLowerCase();
			if (!name) return;

			const matches = normalizedMatchers.some((matcher) => name.includes(matcher));
			if (!matches) return;

			const amount = getInventoryItemAmount(item);
			if (amount === null) return;

			found = true;
			total += amount;
		});

		return found ? total : null;
	}

	function normalizeInventoryEntries(inventory: any) {
		if (Array.isArray(inventory)) return inventory;

		if (inventory && typeof inventory === "object") {
			return Object.values(inventory);
		}

		return [];
	}

	function getInventoryItemName(item: any) {
		if (!item || typeof item !== "object") return "";

		const directName = [item.name, item.itemName, item.title, item.item?.name].find((value) => typeof value === "string" && value.length > 0);
		if (directName) return directName;

		const itemId = firstNumber([item.id, item.ID, item.itemID, item.item_id]);
		const itemsMap = ((typeof torndata !== "undefined" ? torndata : {}) as any)?.itemsMap;
		if (itemId !== null && itemsMap && itemsMap[itemId] && typeof itemsMap[itemId].name === "string") {
			return itemsMap[itemId].name;
		}

		return "";
	}

	function getInventoryItemAmount(item: any) {
		if (!item || typeof item !== "object") return null;

		const amount = firstNumber([
			item.quantity,
			item.amount,
			item.count,
			item.available,
			item.owned,
			item.qty,
		]);

		return amount;
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
