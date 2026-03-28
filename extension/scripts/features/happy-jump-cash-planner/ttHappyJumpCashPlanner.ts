(async () => {
	if (!getPageStatus().access) return;

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
				"settings.pages.stocks.happyJumpCashPlannerConfig",
				"userdata.stocks",
				"userdata.money",
				"userdata.networth",
			],
		},
		() => (hasAPIData() ? true : "No API access.")
	);

	const ITEM_KEYS = ["xanax", "ecstasy", "eroticDvd"] as const;
	type ItemKey = (typeof ITEM_KEYS)[number];

	const ITEM_NAMES: Record<ItemKey, string> = {
		xanax: "Xanax",
		ecstasy: "Ecstasy",
		eroticDvd: "Erotic DVD",
	};

	const CACHE = {
		marketNamespace: "happyJumpPlanner",
		marketKey: "marketPrices",
		marketTtl: TO_MILLIS.MINUTES * 5,
		financialNamespace: "happyJumpPlanner",
		financialKey: "financialSnapshot",
		ownedNamespace: "happyJumpPlanner",
		ownedKey: "ownedItemsSnapshot",
		snapshotTtl: TO_MILLIS.MINUTES * 1,
	};

	interface PlannerConfig {
		startDateTime: string;
		endDateTime: string;
		boosterCooldownHours: number;
		ownedXanax: number;
		ownedEcstasy: number;
		ownedEroticDvd: number;
		manualPriceXanax: number;
		manualPriceEcstasy: number;
		manualPriceEroticDvd: number;
		useOwnedFirst: boolean;
		manualOverridesAuto: boolean;
		untouchedReserve: number;
		prioritizeStocksFirst: boolean;
		targetRules: string;
		excludedStocks: string;
		allowPartialStockProgress: boolean;
		maxSharePrice: number;
	}

	type AutoValue = { value: number; source: string; available: boolean };
	type LoaderStatus = { loading: boolean; error: string };
	interface AutoData {
		cash: AutoValue;
		networth: AutoValue;
		bankAmount: AutoValue;
		owned: Record<ItemKey, AutoValue>;
		prices: Record<ItemKey, AutoValue>;
		stocks: Record<string, any>;
		loaders: {
			financial: LoaderStatus;
			ownedItems: LoaderStatus;
			marketPrices: LoaderStatus;
		};
		updatedAt: number;
	}

	const defaultConfig: PlannerConfig = {
		startDateTime: "",
		endDateTime: "",
		boosterCooldownHours: 48,
		ownedXanax: 0,
		ownedEcstasy: 0,
		ownedEroticDvd: 0,
		manualPriceXanax: 0,
		manualPriceEcstasy: 0,
		manualPriceEroticDvd: 0,
		useOwnedFirst: true,
		manualOverridesAuto: false,
		untouchedReserve: 0,
		prioritizeStocksFirst: true,
		targetRules: "",
		excludedStocks: "",
		allowPartialStockProgress: true,
		maxSharePrice: 0,
	};

	let config: PlannerConfig = { ...defaultConfig };
	let autoData: AutoData = createAutoDefault();
	let content: HTMLElement;
	let saveTimeout: ReturnType<typeof setTimeout>;
	let refreshButton: HTMLButtonElement;
	let warningNode: HTMLElement;
	let resultsNode: HTMLElement;

	function createAutoDefault(): AutoData {
		return {
			cash: { value: 0, available: false, source: "manual" },
			networth: { value: 0, available: false, source: "manual" },
			bankAmount: { value: 0, available: false, source: "manual" },
			owned: {
				xanax: { value: 0, available: false, source: "manual" },
				ecstasy: { value: 0, available: false, source: "manual" },
				eroticDvd: { value: 0, available: false, source: "manual" },
			},
			prices: {
				xanax: { value: 0, available: false, source: "manual" },
				ecstasy: { value: 0, available: false, source: "manual" },
				eroticDvd: { value: 0, available: false, source: "manual" },
			},
			stocks: {},
			loaders: {
				financial: { loading: false, error: "" },
				ownedItems: { loading: false, error: "" },
				marketPrices: { loading: false, error: "" },
			},
			updatedAt: 0,
		};
	}

	async function initialize() {
		await requireElement("#stockmarketroot");
		if (!feature.enabled()) return;

		const stockMarketRoot = document.querySelector("#stockmarketroot");
		const target = stockMarketRoot?.firstElementChild || document.querySelector(".content-wrapper > .delimiter-999");
		if (!target) return;

		const built = createContainer("Happy Jump Cash Planner", { previousElement: target, class: "mt10", compact: true });
		content = built.content;
		config = { ...defaultConfig, ...(settings.pages.stocks.happyJumpCashPlannerConfig || {}) };
		buildLayout();

		await refreshAutoData(true);
	}

	function teardown() {
		removeContainer("Happy Jump Cash Planner");
	}

	async function refreshAutoData(useCache: boolean = false) {
		setLoaderState("financial", true, "");
		setLoaderState("ownedItems", true, "");
		setLoaderState("marketPrices", true, "");
		renderResults();
	}

	function setLoaderState(loader: keyof AutoData["loaders"], loading: boolean, error: string) {
		autoData.loaders[loader] = { loading, error };
	}

	async function loadFinancialData(useCache: boolean) {
		try {
			const snapshot: any = await fetchFinancialSnapshot(useCache);
			autoData.cash = toAutoValue(snapshot?.money?.onhand ?? snapshot?.money?.wallet, "torn-api user.money");
			autoData.networth = toAutoValue(snapshot?.networth?.total, "torn-api user.networth");
			autoData.bankAmount = toAutoValue(snapshot?.money?.city_bank?.amount, "torn-api user.money.city_bank");
			autoData.stocks = snapshot?.stocks || {};
			const hasAnyFinancial = autoData.cash.available || autoData.networth.available || autoData.bankAmount.available;
			const financialError = hasAnyFinancial ? "" : "Financial auto-fetch unavailable. Use manual fallback values where needed.";
			setLoaderState("financial", false, financialError);
		} catch (error: any) {
			setLoaderState("financial", false, "Financial auto-fetch unavailable. Use manual fallback values where needed.");
			console.warn("[TT Happy Jump] Financial data fetch failed:", error?.message || error);
		}
	}

		await Promise.allSettled([loadFinancialData(useCache), loadOwnedItems(useCache), loadMarketPrices(useCache)]);
		autoData.updatedAt = Date.now();
		renderResults();
	}

	function setLoaderState(loader: keyof AutoData["loaders"], loading: boolean, error: string) {
		autoData.loaders[loader] = { loading, error };
	}

	async function fetchUserResponse(useCache: boolean) {
		if (useCache && ttCache.hasValue(CACHE.userNamespace, CACHE.userKey)) {
			return ttCache.get(CACHE.userNamespace, CACHE.userKey);
		}

		const [moneyResponse, networthResponse, stocksResponse] = await Promise.allSettled([
			fetchData("tornv2", { section: "user", id: "money", succeedOnError: true, silent: true }),
			fetchData("tornv2", { section: "user", id: "networth", succeedOnError: true, silent: true }),
			fetchData("tornv2", { section: "user", id: "stocks", succeedOnError: true, silent: true }),
		]);

		const moneyValue: any = moneyResponse.status === "fulfilled" ? moneyResponse.value : null;
		const networthValue: any = networthResponse.status === "fulfilled" ? networthResponse.value : null;
		const stocksValue: any = stocksResponse.status === "fulfilled" ? stocksResponse.value : null;

		const snapshot = { money, networth, inventory, stocks };

		await ttCache.set({ [CACHE.ownedKey]: inventory }, CACHE.snapshotTtl, CACHE.ownedNamespace);
		return inventory;
	}

	async function loadFinancialData(useCache: boolean) {
		try {
			const snapshot: any = await fetchUserResponse(useCache);
			autoData.cash = toAutoValue(snapshot?.money?.onhand ?? snapshot?.money?.wallet, "torn-api user.money");
			autoData.networth = toAutoValue(snapshot?.networth?.total, "torn-api user.networth");
			autoData.bankAmount = toAutoValue(snapshot?.money?.city_bank?.amount, "torn-api user.money.city_bank");
			autoData.stocks = snapshot?.stocks || {};
			setLoaderState("financial", false, "");
		} catch (error: any) {
			setLoaderState("financial", false, "Financial auto-fetch unavailable. Use manual fallback values where needed.");
			console.warn("[TT Happy Jump] Financial data fetch failed:", error?.message || error);
		}
	}

	async function loadOwnedItems(useCache: boolean) {
		try {
			const snapshot: any = await fetchUserResponse(useCache);
			const inventory = snapshot?.inventory || [];
			autoData.owned = {
				xanax: toAutoValue(getInventoryCount(inventory, ITEM_NAMES.xanax), "torn-api inventory"),
				ecstasy: toAutoValue(getInventoryCount(inventory, ITEM_NAMES.ecstasy), "torn-api inventory"),
				eroticDvd: toAutoValue(getInventoryCount(inventory, ITEM_NAMES.eroticDvd), "torn-api inventory"),
			};
			setLoaderState("ownedItems", false, "");
		} catch (error: any) {
			setLoaderState("ownedItems", false, "Owned-item auto-fetch unavailable. Use manual owned item fields.");
			console.warn("[TT Happy Jump] Owned-items fetch failed:", error?.message || error);
		}
	}

	async function fetchLiveMarketPrices(useCache: boolean) {
		if (useCache && ttCache.hasValue(CACHE.marketNamespace, CACHE.marketKey)) {
			return ttCache.get<Record<ItemKey, AutoValue>>(CACHE.marketNamespace, CACHE.marketKey) || {
				xanax: { value: 0, available: false, source: "manual" },
				ecstasy: { value: 0, available: false, source: "manual" },
				eroticDvd: { value: 0, available: false, source: "manual" },
			};
		}

		const result: Record<ItemKey, AutoValue> = {
			xanax: { value: 0, available: false, source: "manual" },
			ecstasy: { value: 0, available: false, source: "manual" },
			eroticDvd: { value: 0, available: false, source: "manual" },
		};

		await Promise.all(
			ITEM_KEYS.map(async (key) => {
				const itemId = getItemIdByName(ITEM_NAMES[key]);
				if (!itemId) return;

				let livePrice = 0;
				try {
					const response: any = await fetchItemMarket(itemId, {
						limit: 3,
						useCache,
						cacheSeconds: 30,
						cacheNamespace: "livePrice",
					});

					livePrice = getLowestItemMarketPrice(response);
				} catch (error) {
					livePrice = 0;
				}

				if (livePrice > 0) {
					result[key] = toAutoValue(livePrice, "torn-api market.itemmarket", false);
					return;
				}

				const tornDataPrice = Number((torndata.itemsMap?.[itemId] as any)?.value?.market_price || 0);
				if (tornDataPrice > 0) {
					result[key] = toAutoValue(tornDataPrice, "torndata itemsMap", false);
				}
			})
		);

		await ttCache.set({ [CACHE.marketKey]: result }, CACHE.marketTtl, CACHE.marketNamespace);
		return result;
	}

	async function loadMarketPrices(useCache: boolean) {
		try {
			autoData.prices = await fetchLiveMarketPrices(useCache);
			setLoaderState("marketPrices", false, "");
		} catch (error: any) {
			setLoaderState("marketPrices", false, "Market-price auto-fetch unavailable. Use manual price fields.");
			console.warn("[TT Happy Jump] Market price fetch failed:", error?.message || error);
		}
	}

	function getItemIdByName(itemName: string) {
		const match = Object.entries(torndata.itemsMap || {}).find(([, value]) => value.name?.toLowerCase() === itemName.toLowerCase());
		return match ? Number(match[0]) : 0;
	}

	function getInventoryCount(inventory: any[], itemName: string) {
		const byName = inventory.find((entry) => entry?.name?.toLowerCase() === itemName.toLowerCase());
		if (byName?.quantity !== undefined) return Number(byName.quantity) || 0;

		const itemId = getItemIdByName(itemName);
		if (!itemId) return 0;
		return Number(inventory.find((entry) => Number(entry?.ID) === itemId)?.quantity || 0);
	}

	function toAutoValue(value: any, source: string, allowZero: boolean = true): AutoValue {
		const parsed = Number(value || 0);
		if (!isFinite(parsed) || parsed < 0) return { value: 0, source: "manual", available: false };
		if (!allowZero && parsed <= 0) return { value: 0, source: "manual", available: false };
		return { value: parsed, source, available: true };
	}

	function buildLayout() {
		if (!content) return;
		content.innerHTML = "";
		const wrap = elementBuilder({ type: "div", class: "tt-hjcp" });

		refreshButton = elementBuilder({
			type: "button",
			class: "tt-btn",
			text: "Refresh auto data",
			events: {
				click: async () => {
					await refreshAutoData(false);
				},
			},
		}) as HTMLButtonElement;

		wrap.appendChild(
			elementBuilder({
				type: "div",
				class: "tt-hjcp-head",
				children: [
					elementBuilder({ type: "div", class: "tt-hjcp-note", text: "Rule-based planner: happy jump budget first, then stock-first allocation." }),
					refreshButton,
				],
			})
		);

		warningNode = elementBuilder({ type: "div", class: "tt-hjcp-warning" });
		wrap.appendChild(warningNode);

		const inputs = elementBuilder({ type: "div", class: "tt-hjcp-grid" });
		inputs.appendChild(inputField("Start", "datetime-local", "startDateTime", config.startDateTime));
		inputs.appendChild(inputField("End", "datetime-local", "endDateTime", config.endDateTime));
		inputs.appendChild(inputField("Booster cooldown (hours)", "number", "boosterCooldownHours", config.boosterCooldownHours));
		inputs.appendChild(inputField("Owned Xanax (manual)", "number", "ownedXanax", config.ownedXanax));
		inputs.appendChild(inputField("Owned Ecstasy (manual)", "number", "ownedEcstasy", config.ownedEcstasy));
		inputs.appendChild(inputField("Owned Erotic DVDs (manual)", "number", "ownedEroticDvd", config.ownedEroticDvd));
		inputs.appendChild(inputField("Xanax price (manual)", "number", "manualPriceXanax", config.manualPriceXanax));
		inputs.appendChild(inputField("Ecstasy price (manual)", "number", "manualPriceEcstasy", config.manualPriceEcstasy));
		inputs.appendChild(inputField("Erotic DVD price (manual)", "number", "manualPriceEroticDvd", config.manualPriceEroticDvd));
		inputs.appendChild(inputField("Untouched reserve", "number", "untouchedReserve", config.untouchedReserve));
		inputs.appendChild(inputField("Excluded stocks (CSV)", "text", "excludedStocks", config.excludedStocks));
		inputs.appendChild(inputField("Max share price (0 = off)", "number", "maxSharePrice", config.maxSharePrice));
		inputs.appendChild(checkField("Use owned items first", "useOwnedFirst", config.useOwnedFirst));
		inputs.appendChild(checkField("Manual values override auto", "manualOverridesAuto", config.manualOverridesAuto));
		inputs.appendChild(checkField("Prioritize stocks first", "prioritizeStocksFirst", config.prioritizeStocksFirst));
		inputs.appendChild(checkField("Allow partial stock progress", "allowPartialStockProgress", config.allowPartialStockProgress));
		inputs.appendChild(targetRulesField());
		wrap.appendChild(inputs);

		resultsNode = elementBuilder({ type: "div", class: "tt-hjcp-results" });
		wrap.appendChild(resultsNode);
		content.appendChild(wrap);
		renderResults();
	}

	function chooseEffectiveValue(manualValue: number, autoValue: AutoValue) {
		const manual = Math.max(0, Number(manualValue || 0));
		if (config.manualOverridesAuto) return manual;
		return autoValue.available ? autoValue.value : manual;
	}

	function calculateModel() {
		const cooldownHours = Math.max(1, Number(config.boosterCooldownHours || 48));
		const start = config.startDateTime ? new Date(config.startDateTime) : null;
		const end = config.endDateTime ? new Date(config.endDateTime) : null;
		const validDates = start instanceof Date && end instanceof Date && !isNaN(start.getTime()) && !isNaN(end.getTime());
		const rangeMs = validDates ? end.getTime() - start.getTime() : 0;
		const cooldownMs = cooldownHours * TO_MILLIS.HOURS;

		// Deterministic jump counting:
		// startDateTime is the earliest possible first jump time and each jump consumes one full cooldown window.
		// We count only complete windows that fit strictly before endDateTime.
		const totalJumps = rangeMs <= 0 ? 0 : Math.floor(rangeMs / cooldownMs);

		// Each Erotic DVD covers 6h; fractional DVDs are rounded up per jump.
		const eroticDvdPerJump = Math.ceil(cooldownHours / 6);

		const totalNeeded = {
			xanax: totalJumps * 4,
			ecstasy: totalJumps,
			eroticDvd: totalJumps * eroticDvdPerJump,
		};

		const owned = {
			xanax: chooseEffectiveValue(config.ownedXanax, autoData.owned.xanax),
			ecstasy: chooseEffectiveValue(config.ownedEcstasy, autoData.owned.ecstasy),
			eroticDvd: chooseEffectiveValue(config.ownedEroticDvd, autoData.owned.eroticDvd),
		};

		const additionalNeeded = {
			xanax: config.useOwnedFirst ? Math.max(0, totalNeeded.xanax - owned.xanax) : totalNeeded.xanax,
			ecstasy: config.useOwnedFirst ? Math.max(0, totalNeeded.ecstasy - owned.ecstasy) : totalNeeded.ecstasy,
			eroticDvd: config.useOwnedFirst ? Math.max(0, totalNeeded.eroticDvd - owned.eroticDvd) : totalNeeded.eroticDvd,
		};

		const prices = {
			xanax: chooseEffectiveValue(config.manualPriceXanax, autoData.prices.xanax),
			ecstasy: chooseEffectiveValue(config.manualPriceEcstasy, autoData.prices.ecstasy),
			eroticDvd: chooseEffectiveValue(config.manualPriceEroticDvd, autoData.prices.eroticDvd),
		};

		const totalProjectedCost =
			additionalNeeded.xanax * prices.xanax + additionalNeeded.ecstasy * prices.ecstasy + additionalNeeded.eroticDvd * prices.eroticDvd;
		const projectedCostPerJump = totalJumps > 0 ? totalProjectedCost / totalJumps : 0;

		const availableCash = autoData.cash.available
			? autoData.cash.value
			: Math.max(0, Number((userdata as any).money?.onhand || userdata.money?.wallet || userdata.networth?.wallet || 0));
		const untouchedReserve = Math.max(0, Number(config.untouchedReserve || 0));
		const allocatableCash = Math.max(0, availableCash - untouchedReserve - totalProjectedCost);

		const stockRecommendation = getStockRecommendation(allocatableCash);
		const bankAllocation = Math.max(0, allocatableCash - stockRecommendation.usedCash);

		return {
			cooldownHours,
			eroticDvdPerJump,
			totalJumps,
			totalNeeded,
			owned,
			additionalNeeded,
			prices,
			totalProjectedCost,
			projectedCostPerJump,
			availableCash,
			untouchedReserve,
			allocatableCash,
			stockRecommendation,
			bankAllocation,
			networth: autoData.networth,
			bankAmount: autoData.bankAmount,
		};
	}

	function parseStockTargets() {
		return config.targetRules
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => {
				const [stock, shares] = line.split(":").map((part) => part.trim());
				return {
					stockInput: (stock || "").toUpperCase(),
					targetShares: Math.max(0, Number(shares || 0)),
				};
			})
			.filter((x) => x.stockInput && x.targetShares > 0);
	}

	function getStockPageData() {
		const prices: Record<string, number> = {};
		const aliases: Record<string, string> = {};

		findAllElements("#stockmarketroot ul[class*='stock___'][id]").forEach((row) => {
			const stockId = row.id;
			const price = Number(row.querySelector("#priceTab > :first-child")?.textContent?.replace(/[^\d.]/g, "") || 0);
			if (price > 0) prices[stockId] = price;

			const acronym = row.querySelector<HTMLElement>(".tt-acronym")?.dataset.acronym?.toUpperCase();
			if (acronym) aliases[acronym] = stockId;
		});

		return { prices, aliases };
	}

	function getStockRecommendation(allocatableCash: number) {
		if (allocatableCash <= 0 || !config.prioritizeStocksFirst) {
			return { message: "Stocks not prioritized or no allocatable cash.", usedCash: 0, targets: [] };
		}

		const targets = parseStockTargets();
		if (!targets.length) {
			return { message: "No stock target rules found. Route to bank.", usedCash: 0, targets: [] };
		}

		const excluded = new Set(
			config.excludedStocks
				.split(",")
				.map((x) => x.trim().toUpperCase())
				.filter(Boolean)
		);
		const stockPage = getStockPageData();
		const hasAcronymTargets = targets.some((target) => /[A-Z]/.test(target.stockInput));
		const acronymTargetsWithoutAliases = hasAcronymTargets && !Object.keys(stockPage.aliases).length;
		const holdings = autoData.stocks && Object.keys(autoData.stocks).length ? autoData.stocks : userdata.stocks || {};

		let remaining = allocatableCash;
		const recommendations = [];

		for (const target of targets) {
			const stockId = stockPage.aliases[target.stockInput] || target.stockInput;
			if (excluded.has(target.stockInput) || excluded.has(stockId)) continue;

			const sharePrice = Number(stockPage.prices[stockId] || 0);
			if (sharePrice <= 0) continue;
			if (config.maxSharePrice > 0 && sharePrice > config.maxSharePrice) continue;

			const currentShares = Number(holdings?.[stockId]?.total_shares || 0);
			const missingShares = Math.max(0, target.targetShares - currentShares);
			if (!missingShares) continue;

			const cashNeededToComplete = missingShares * sharePrice;
			if (cashNeededToComplete <= remaining) {
				recommendations.push({
					stock: stockId,
					currentShares,
					targetShares: target.targetShares,
					missingShares,
					sharePrice,
					cashNeededToComplete,
					recommendedSharesToBuy: missingShares,
					recommendedSpend: cashNeededToComplete,
					isPartial: false,
				});
				remaining -= cashNeededToComplete;
				continue;
			}

			if (config.allowPartialStockProgress && remaining > 0) {
				const partialShares = Math.floor(remaining / sharePrice);
				if (partialShares > 0) {
					const spend = partialShares * sharePrice;
					recommendations.push({
						stock: stockId,
						currentShares,
						targetShares: target.targetShares,
						missingShares,
						sharePrice,
						cashNeededToComplete,
						recommendedSharesToBuy: partialShares,
						recommendedSpend: spend,
						isPartial: true,
					});
					remaining -= spend;
				}
			}
		}

		return {
			message: recommendations.length
				? "Rule-based stock targets matched (not predictive)."
				: "No valid stock recommendation matched; route allocatable cash to bank.",
			usedCash: allocatableCash - remaining,
			targets: recommendations,
			acronymTargetsWithoutAliases,
		};
	}

	function renderResults() {
		if (!resultsNode) return;
		const model = calculateModel();
		const loading = autoData.loaders.financial.loading || autoData.loaders.ownedItems.loading || autoData.loaders.marketPrices.loading;
		refreshButton.textContent = loading ? "Refreshing..." : "Refresh auto data";
		warningNode.textContent = [autoData.loaders.financial.error, autoData.loaders.ownedItems.error, autoData.loaders.marketPrices.error]
			.filter(Boolean)
			.join(" ");
		resultsNode.innerHTML = "";

		const output = resultsNode;
		output.appendChild(statLine("Booster cooldown used", `${model.cooldownHours}h`));
		output.appendChild(statLine("Erotic DVDs needed per jump", `${model.eroticDvdPerJump}`));
		output.appendChild(statLine("Total jumps possible", `${model.totalJumps}`));
		output.appendChild(statLine("Total Xanax needed", `${model.totalNeeded.xanax}`));
		output.appendChild(statLine("Total Ecstasy needed", `${model.totalNeeded.ecstasy}`));
		output.appendChild(statLine("Total Erotic DVDs needed", `${model.totalNeeded.eroticDvd}`));
		output.appendChild(statLine("Owned Xanax (effective)", `${model.owned.xanax}`));
		output.appendChild(statLine("Owned Ecstasy (effective)", `${model.owned.ecstasy}`));
		output.appendChild(statLine("Owned Erotic DVDs (effective)", `${model.owned.eroticDvd}`));
		output.appendChild(statLine("Auto Xanax owned", renderAutoOrManual(autoData.owned.xanax, "manual owned Xanax")));
		output.appendChild(statLine("Auto Ecstasy owned", renderAutoOrManual(autoData.owned.ecstasy, "manual owned Ecstasy")));
		output.appendChild(statLine("Auto Erotic DVDs owned", renderAutoOrManual(autoData.owned.eroticDvd, "manual owned Erotic DVDs")));
		output.appendChild(statLine("Additional Xanax needed", `${model.additionalNeeded.xanax}`));
		output.appendChild(statLine("Additional Ecstasy needed", `${model.additionalNeeded.ecstasy}`));
		output.appendChild(statLine("Additional Erotic DVDs needed", `${model.additionalNeeded.eroticDvd}`));
		output.appendChild(statLine("Xanax market price", formatNumber(model.prices.xanax, { currency: true })));
		output.appendChild(statLine("Ecstasy market price", formatNumber(model.prices.ecstasy, { currency: true })));
		output.appendChild(statLine("Erotic DVD market price", formatNumber(model.prices.eroticDvd, { currency: true })));
		output.appendChild(statLine("Auto Xanax market price", renderAutoOrManual(autoData.prices.xanax, "manual Xanax price")));
		output.appendChild(statLine("Auto Ecstasy market price", renderAutoOrManual(autoData.prices.ecstasy, "manual Ecstasy price")));
		output.appendChild(statLine("Auto Erotic DVD market price", renderAutoOrManual(autoData.prices.eroticDvd, "manual Erotic DVD price")));
		output.appendChild(statLine("Projected cost per jump", formatNumber(model.projectedCostPerJump, { currency: true })));
		output.appendChild(statLine("Total projected happy jump cost", formatNumber(model.totalProjectedCost, { currency: true })));

		output.appendChild(elementBuilder({ type: "hr" }));
		output.appendChild(statLine("Available cash", formatNumber(model.availableCash, { currency: true })));
		output.appendChild(statLine("Auto cash on hand", renderAutoOrManual(autoData.cash, "manual cash fallback", true)));
		output.appendChild(statLine("Auto networth", renderAutoOrManual(model.networth, "manual networth fallback", true)));
		output.appendChild(statLine("Auto bank invested", renderAutoOrManual(model.bankAmount, "manual bank fallback", true)));
		output.appendChild(statLine("Untouched reserve", formatNumber(model.untouchedReserve, { currency: true })));
		output.appendChild(statLine("Allocatable cash", formatNumber(model.allocatableCash, { currency: true })));
		output.appendChild(statLine("Stock recommendation", model.stockRecommendation.message));
		if (model.stockRecommendation.acronymTargetsWithoutAliases) {
			output.appendChild(
				elementBuilder({
					type: "div",
					class: "tt-hjcp-warning",
					text: "Acronym targets detected but no on-page acronyms were found. Enable stock acronym labels or use stock IDs.",
				})
			);
		}

		for (const target of model.stockRecommendation.targets) {
			output.appendChild(
				statLine(
					`${target.stock} progress`,
					`${target.currentShares}/${target.targetShares} shares, need ${target.missingShares}, ` +
						`${target.isPartial ? "partial" : "full"} buy ${target.recommendedSharesToBuy}`
				)
			);
			output.appendChild(statLine(`${target.stock} cash needed to complete`, formatNumber(target.cashNeededToComplete, { currency: true })));
		}

		output.appendChild(statLine("Stock allocation used", formatNumber(model.stockRecommendation.usedCash, { currency: true })));
		output.appendChild(statLine("Bank allocation recommendation", formatNumber(model.bankAllocation, { currency: true })));

		const sources = [
			`Owned source: ${autoData.owned.xanax.source}`,
			`Prices: X(${autoData.prices.xanax.source}), E(${autoData.prices.ecstasy.source}), DVD(${autoData.prices.eroticDvd.source})`,
		].join(" | ");
		output.appendChild(elementBuilder({ type: "div", class: "tt-hjcp-note", text: sources }));

		if (model.allocatableCash <= 0) {
			output.appendChild(elementBuilder({ type: "div", class: "tt-hjcp-empty", text: "No excess cash is available to allocate." }));
		}
	}

	function renderAutoOrManual(autoValue: AutoValue, manualFieldLabel: string, currency: boolean = false) {
		return autoValue.available ? `${formatNumber(autoValue.value, { currency })} (${autoValue.source})` : `Unavailable (enter ${manualFieldLabel})`;
	}

	function targetRulesField() {
		return elementBuilder({
			type: "label",
			class: "tt-hjcp-target-rules",
			children: [
				elementBuilder({ type: "span", text: "Stock target rules (STOCK_ID_OR_ACRONYM:TARGET_SHARES per line)" }),
				elementBuilder({
					type: "textarea",
					text: config.targetRules,
					attributes: { rows: "4", placeholder: "1:100\nTSB:250" },
					events: {
						input: (event) => {
							config.targetRules = (event.target as HTMLTextAreaElement).value;
							saveAndRerender();
						},
					},
				}),
			],
		});
	}

	function inputField(labelText: string, type: string, key: keyof PlannerConfig, value: string | number) {
		return elementBuilder({
			type: "label",
			class: "tt-hjcp-field",
			children: [
				elementBuilder({ type: "span", text: labelText }),
				elementBuilder({
					type: "input",
					attributes: { type, value: String(value ?? "") },
					events: {
						input: (event) => {
							const input = event.target as HTMLInputElement;
							(config as any)[key] = type === "number" ? Math.max(0, Number(input.value || 0)) : input.value;
							saveAndRerender();
						},
					},
				}),
			],
		});
	}

	function checkField(labelText: string, key: keyof PlannerConfig, checked: boolean) {
		const checkbox = elementBuilder({
			type: "input",
			attributes: { type: "checkbox" },
			events: {
				change: (event) => {
					(config as any)[key] = (event.target as HTMLInputElement).checked;
					saveAndRerender();
				},
			},
		});
		(checkbox as HTMLInputElement).checked = checked;

		return elementBuilder({
			type: "label",
			class: "tt-hjcp-check",
			children: [checkbox, elementBuilder({ type: "span", text: labelText })],
		});
	}

	function statLine(labelText: string, valueText: string) {
		return elementBuilder({
			type: "div",
			class: "tt-hjcp-stat",
			children: [elementBuilder({ type: "span", text: labelText }), elementBuilder({ type: "strong", text: valueText })],
		});
	}

	function saveAndRerender() {
		clearTimeout(saveTimeout);
		saveTimeout = setTimeout(async () => {
			await ttStorage.change({ settings: { pages: { stocks: { happyJumpCashPlannerConfig: config } } } });
			renderResults();
		}, 150);
	}
})();
