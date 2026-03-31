(async () => {
	if (!getPageStatus().access) return;

	const ITEM_IDS = {
		xanax: 206,
		ecstasy: 197,
		eroticDvd: 366,
	} as const;

	const PER_JUMP = {
		xanax: 3,
		ecstasy: 1,
	} as const;

	featureManager.registerFeature(
		"Happy Jump Cash Planner",
		"stocks",
		() => settings.pages.stocks.happyJumpCashPlanner,
		null,
		initialise,
		teardown,
		{
			storage: ["settings.pages.stocks.happyJumpCashPlanner", "userdata.money", "userdata.networth", "userdata.stocks", "stockdata", "torndata.itemsMap"],
		},
		null
	);

	let containerElement: HTMLElement;

	async function initialise() {
		const stockRoot = await requireElement("#stockmarketroot");
		const { content, container } = createContainer("Happy Jump Cash Planner", {
			class: "mt10 mb10",
			previousElement: stockRoot.firstElementChild,
			compact: true,
		});
		containerElement = container;

		const planner = elementBuilder({
			type: "div",
			class: "tt-happy-jump-planner",
			children: [
				elementBuilder({ type: "div", class: "tt-hjp-status" }),
				elementBuilder({ type: "div", class: "tt-hjp-snapshot" }),
				elementBuilder({ type: "div", class: "tt-hjp-inputs" }),
				elementBuilder({ type: "div", class: "tt-hjp-results" }),
			],
		});
		content.appendChild(planner);

		const inputs = planner.querySelector(".tt-hjp-inputs");
		inputs.appendChild(createInput("Start (Torn time)", "datetime-local", "tt-hjp-start"));
		inputs.appendChild(createInput("End (Torn time)", "datetime-local", "tt-hjp-end"));
		inputs.appendChild(createInput("Booster cooldown (hours)", "number", "tt-hjp-cooldown", "48"));
		inputs.appendChild(createInput("Owned Xanax", "number", "tt-hjp-owned-xanax", "0"));
		inputs.appendChild(createInput("Owned Ecstasy", "number", "tt-hjp-owned-ecstasy", "0"));
		inputs.appendChild(createInput("Owned Erotic DVDs", "number", "tt-hjp-owned-dvd", "0"));
		inputs.appendChild(createInput("Untouched reserve cash", "number", "tt-hjp-reserve", "0"));
		inputs.appendChild(createTextarea("Stock targets (e.g. TSB:1000)", "tt-hjp-stock-rules"));
		inputs.appendChild(createInput("Max share price (optional)", "number", "tt-hjp-max-share-price", ""));

		const onUpdate = () => render(planner);
		findAllElements(".tt-hjp-input").forEach((el) => el.addEventListener("input", onUpdate));

		render(planner);
	}

	function render(root: HTMLElement) {
		const status = root.querySelector(".tt-hjp-status");
		const snapshot = root.querySelector(".tt-hjp-snapshot");
		const results = root.querySelector(".tt-hjp-results");

		const wallet = getNumber((userdata as any)?.networth?.wallet);
		const vault = getNumber((userdata as any)?.networth?.vault);
		const bankInvested = getNumber((userdata as any)?.money?.city_bank?.amount);
		const availableCash = wallet + vault;
		const networth = getNumber((userdata as any)?.networth?.total);
		const stockMarketValue = getNumber((userdata as any)?.networth?.stockmarket);
		const userStocks = ((userdata as any)?.stocks ?? {}) as Record<string, any>;
		const stockEntries = Object.values(userStocks);
		const stockPositionsTracked = stockEntries.length;
		const totalSharesHeld = stockEntries.reduce((sum, stock: any) => sum + getNumber(stock?.total_shares), 0);

		const prices = {
			xanax: getNumber((torndata as any)?.itemsMap?.[ITEM_IDS.xanax]?.market_value),
			ecstasy: getNumber((torndata as any)?.itemsMap?.[ITEM_IDS.ecstasy]?.market_value),
			eroticDvd: getNumber((torndata as any)?.itemsMap?.[ITEM_IDS.eroticDvd]?.market_value),
		};
		const hasAllItemPrices = prices.xanax > 0 && prices.ecstasy > 0 && prices.eroticDvd > 0;

		snapshot.innerHTML = [
			row("Available cash", formatCurrencyOrUnavailable(availableCash, true)),
			row("Cash on hand", formatCurrencyOrUnavailable(wallet)),
			row("Vault cash", formatCurrencyOrUnavailable(vault)),
			row("Bank invested", formatCurrencyOrUnavailable(bankInvested)),
			row("Networth", formatCurrencyOrUnavailable(networth)),
			row("Stock market value", formatCurrencyOrUnavailable(stockMarketValue)),
			row("Stock positions tracked", formatNumber(stockPositionsTracked)),
			row("Total shares held", formatNumber(totalSharesHeld)),
			row("Xanax price", formatCurrencyOrUnavailable(prices.xanax)),
			row("Ecstasy price", formatCurrencyOrUnavailable(prices.ecstasy)),
			row("Erotic DVD price", formatCurrencyOrUnavailable(prices.eroticDvd)),
		].join("");

		const startMs = parseTornDateInput(getInputValue("tt-hjp-start"));
		const endMs = parseTornDateInput(getInputValue("tt-hjp-end"));
		const cooldownHours = getPositiveNumber(getInputValue("tt-hjp-cooldown"));
		const owned = {
			xanax: getNonNegativeInt(getInputValue("tt-hjp-owned-xanax")),
			ecstasy: getNonNegativeInt(getInputValue("tt-hjp-owned-ecstasy")),
			eroticDvd: getNonNegativeInt(getInputValue("tt-hjp-owned-dvd")),
		};
		const untouchedReserve = getPositiveNumber(getInputValue("tt-hjp-reserve"));
		const maxSharePrice = getPositiveNumber(getInputValue("tt-hjp-max-share-price"));
		const stockRulesText = getInputValue("tt-hjp-stock-rules");

		const warnings: string[] = [];
		if (!hasAPIData()) warnings.push("No API access: some values are unavailable.");
		if (cooldownHours <= 0) warnings.push("Cooldown must be greater than 0.");
		if (!hasAllItemPrices) warnings.push("Some item prices are unavailable; quantity planning still works.");

		let jumps = 0;
		if (startMs && endMs && cooldownHours > 0 && endMs > startMs) {
			jumps = Math.floor((endMs - startMs) / (cooldownHours * TO_MILLIS.HOURS));
		}

		const dvdsPerJump = cooldownHours > 0 ? Math.ceil(cooldownHours / 6) : 0;
		const totalNeeded = {
			xanax: jumps * PER_JUMP.xanax,
			ecstasy: jumps * PER_JUMP.ecstasy,
			eroticDvd: jumps * dvdsPerJump,
		};
		const toBuy = {
			xanax: Math.max(0, totalNeeded.xanax - owned.xanax),
			ecstasy: Math.max(0, totalNeeded.ecstasy - owned.ecstasy),
			eroticDvd: Math.max(0, totalNeeded.eroticDvd - owned.eroticDvd),
		};

		const subtotals = {
			xanax: toBuy.xanax * prices.xanax,
			ecstasy: toBuy.ecstasy * prices.ecstasy,
			eroticDvd: toBuy.eroticDvd * prices.eroticDvd,
		};
		const happyJumpBudget = hasAllItemPrices ? subtotals.xanax + subtotals.ecstasy + subtotals.eroticDvd : 0;
		const allocatableCash = Math.max(0, availableCash - untouchedReserve - happyJumpBudget);

		const allocation = allocateStocks(stockRulesText, allocatableCash, maxSharePrice, userStocks);

		status.textContent = warnings.length ? warnings.join(" ") : "Planner ready.";
		status.classList.toggle("warning", warnings.length > 0);

		results.innerHTML = [
			row("Full jumps", formatNumber(jumps)),
			row("Cooldown hours used", formatNumber(cooldownHours)),
			row("Erotic DVDs per jump", formatNumber(dvdsPerJump)),
			row("Total Xanax needed", formatNumber(totalNeeded.xanax)),
			row("Total Ecstasy needed", formatNumber(totalNeeded.ecstasy)),
			row("Total Erotic DVDs needed", formatNumber(totalNeeded.eroticDvd)),
			row("Owned Xanax used", formatNumber(owned.xanax)),
			row("Owned Ecstasy used", formatNumber(owned.ecstasy)),
			row("Owned Erotic DVDs used", formatNumber(owned.eroticDvd)),
			row("Buy Xanax", formatNumber(toBuy.xanax)),
			row("Buy Ecstasy", formatNumber(toBuy.ecstasy)),
			row("Buy Erotic DVDs", formatNumber(toBuy.eroticDvd)),
			row("Xanax subtotal", hasAllItemPrices ? formatNumber(subtotals.xanax, { currency: true }) : "Unavailable"),
			row("Ecstasy subtotal", hasAllItemPrices ? formatNumber(subtotals.ecstasy, { currency: true }) : "Unavailable"),
			row("Erotic DVDs subtotal", hasAllItemPrices ? formatNumber(subtotals.eroticDvd, { currency: true }) : "Unavailable"),
			row("Total happy jump budget", hasAllItemPrices ? formatNumber(happyJumpBudget, { currency: true }) : "Unavailable"),
			row("Allocatable cash", formatNumber(allocatableCash, { currency: true })),
			row("Stock allocation spend", formatNumber(allocation.spent, { currency: true })),
			row("Bank remainder recommendation", formatNumber(allocation.remainder, { currency: true })),
			`<div class="tt-hjp-stock-lines">${allocation.lines.length ? allocation.lines.join("<br>") : "No valid stock rules provided."}</div>`,
		].join("");
	}

	function allocateStocks(rulesText: string, cash: number, maxSharePrice: number, userStocks: Record<string, any>) {
		let remaining = cash;
		const lines: string[] = [];
		let spent = 0;

		rulesText
			.split(/\n|,/)
			.map((rule) => rule.trim())
			.filter(Boolean)
			.forEach((rule) => {
				const [rawTicker, rawTarget] = rule.split(":").map((x) => x?.trim());
				const targetShares = Math.max(0, parseInt(rawTarget));
				if (!rawTicker || !Number.isFinite(targetShares)) return;

				const match = Object.entries(stockdata)
					.filter(([key, value]) => key !== "date" && typeof value !== "number")
					.find(([id, value]: [string, any]) => id === rawTicker || value?.acronym?.toUpperCase() === rawTicker.toUpperCase());
				if (!match) return;

				const [stockId, stockInfo] = match as [string, any];
				const currentPrice = getNumber(stockInfo?.current_price);
				if (currentPrice <= 0) return;
				if (maxSharePrice > 0 && currentPrice > maxSharePrice) {
					lines.push(`${stockInfo.acronym}: skipped (price above max threshold).`);
					return;
				}

				const heldShares = getNumber(userStocks?.[stockId]?.total_shares);
				const missingShares = Math.max(0, targetShares - heldShares);
				if (missingShares <= 0) {
					lines.push(`${stockInfo.acronym}: target met.`);
					return;
				}

				const affordableShares = Math.floor(remaining / currentPrice);
				const buyShares = Math.max(0, Math.min(missingShares, affordableShares));
				const buyCost = buyShares * currentPrice;
				remaining = Math.max(0, remaining - buyCost);
				spent += buyCost;

				lines.push(`${stockInfo.acronym}: buy ${formatNumber(buyShares)} shares (${formatNumber(buyCost, { currency: true })}).`);
			});

		return { spent, remainder: Math.max(0, remaining), lines };
	}

	function parseTornDateInput(value: string): number | undefined {
		if (!value) return undefined;
		const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
		if (!parts) return undefined;
		const [, y, m, d, h, min] = parts;
		return Date.UTC(parseInt(y), parseInt(m) - 1, parseInt(d), parseInt(h), parseInt(min), 0);
	}

	function createInput(label: string, type: string, id: string, value = "") {
		return elementBuilder({
			type: "label",
			class: "tt-hjp-field",
			children: [
				elementBuilder({ type: "span", text: label }),
				elementBuilder({ type: "input", class: "tt-hjp-input", attributes: { type, id, value } }),
			],
		});
	}

	function createTextarea(label: string, id: string) {
		return elementBuilder({
			type: "label",
			class: "tt-hjp-field tt-hjp-field-wide",
			children: [
				elementBuilder({ type: "span", text: label }),
				elementBuilder({ type: "textarea", class: "tt-hjp-input", attributes: { id, rows: "3", placeholder: "TSB:1000\nLAG:250" } }),
			],
		});
	}

	function getInputValue(id: string): string {
		return (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement)?.value?.trim() ?? "";
	}

	function getNumber(value: any): number {
		return Number.isFinite(Number(value)) ? Number(value) : 0;
	}

	function getNonNegativeInt(value: string): number {
		const parsed = parseInt(value);
		return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
	}

	function getPositiveNumber(value: string): number {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
	}

	function formatCurrencyOrUnavailable(value: number, zeroAllowed = false): string {
		if (!value && !zeroAllowed) return "Unavailable";
		return formatNumber(value, { currency: true });
	}

	function row(label: string, value: string) {
		return `<div class="tt-hjp-row"><span>${label}</span><span>${value}</span></div>`;
	}

	function teardown() {
		containerElement?.remove();
	}
})();
