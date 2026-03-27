(async () => {
	if (!getPageStatus().access) return;

	let refreshInterval: number | undefined;
	let panelContent: HTMLElement | undefined;

	const feature = featureManager.registerFeature(
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

		refreshInterval = window.setInterval(() => {
			if (!feature.enabled() || !findContainer("Happy Jump Cash Planner")) return;
			render();
		}, 30000);
	}

	function teardown() {
		if (refreshInterval) {
			clearInterval(refreshInterval);
			refreshInterval = undefined;
		}

		panelContent = undefined;
		removeContainer("Happy Jump Cash Planner");
	}

	function render() {
		if (!panelContent) return;
		panelContent.innerHTML = "";

		const snapshot = getFinancialSnapshot();

		const wrapper = elementBuilder({ type: "div", class: "tt-hjcp-financial" });

		wrapper.appendChild(
			elementBuilder({
				type: "div",
				class: "tt-hjcp-financial__head",
				children: [
					elementBuilder({
						type: "div",
						class: "tt-hjcp-financial__intro",
						children: [
							elementBuilder({
								type: "div",
								class: "tt-hjcp-financial__title",
								text: "Auto-loaded financial snapshot",
							}),
							elementBuilder({
								type: "div",
								class: "tt-hjcp-financial__subtitle",
								text: "This step shows current financial data immediately on panel load. Happy jump and allocation math comes next.",
							}),
						],
					}),
					elementBuilder({
						type: "button",
						class: "tt-btn",
						text: "Refresh snapshot",
						events: {
							click: () => render(),
						},
					}),
				],
			})
		);

		const grid = elementBuilder({ type: "div", class: "tt-hjcp-financial__grid" });

		grid.appendChild(statCard("Available cash", formatMoney(snapshot.availableCash)));
		grid.appendChild(statCard("Cash on hand", formatMoney(snapshot.cashOnHand)));
		grid.appendChild(statCard("Vault cash", formatMoney(snapshot.vaultCash)));
		grid.appendChild(statCard("Bank invested", formatMoney(snapshot.bankInvested)));
		grid.appendChild(statCard("Networth", formatMoney(snapshot.networth)));
		grid.appendChild(statCard("Stock market value", formatMoney(snapshot.stockMarketValue)));
		grid.appendChild(statCard("Stock positions tracked", formatInteger(snapshot.stockPositions)));
		grid.appendChild(statCard("Total shares held", formatInteger(snapshot.totalSharesHeld)));

		wrapper.appendChild(grid);

		wrapper.appendChild(
			elementBuilder({
				type: "div",
				class: "tt-hjcp-financial__foot",
				children: [
					elementBuilder({
						type: "div",
						class: "tt-hjcp-financial__note",
						text: snapshot.updatedLabel,
					}),
					elementBuilder({
						type: "div",
						class: "tt-hjcp-financial__note",
						text: snapshot.sourceLabel,
					}),
				],
			})
		);

		panelContent.appendChild(wrapper);
	}

	function statCard(label: string, value: string) {
		return elementBuilder({
			type: "div",
			class: "tt-hjcp-financial__card",
			children: [
				elementBuilder({
					type: "div",
					class: "tt-hjcp-financial__label",
					text: label,
				}),
				elementBuilder({
					type: "div",
					class: "tt-hjcp-financial__value",
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

		const cashOnHand = firstNumber([
			money.onhand,
			money.wallet,
			networth.wallet,
		]);

		const vaultCash = firstNumber([
			money.vault,
			networth.vault,
		]);

		const availableCash = sumNumbers([cashOnHand, vaultCash]);

		const bankInvested = firstNumber([
			money.city_bank?.amount,
			money.bank?.amount,
			networth.bank,
		]);

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

	function formatMoney(value: number | null) {
		if (value === null) return "Unavailable";
		return formatNumber(value, { currency: true });
	}

	function formatInteger(value: number | null) {
		if (value === null) return "Unavailable";
		return formatNumber(value);
	}
})
();