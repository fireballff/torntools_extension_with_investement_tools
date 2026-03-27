(async () => {
	if (!getPageStatus().access) return;

	featureManager.registerFeature(
		"Happy Jump Cash Planner",
		"stocks",
		() => settings.pages.stocks.happyJumpCashPlanner,
		null,
		initialize,
		teardown,
		{
			storage: ["settings.pages.stocks.happyJumpCashPlanner"],
		},
		async () => {
			await checkDevice();
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

		content.appendChild(
			elementBuilder({
				type: "div",
				class: "tt-hjcp-static",
				children: [
					elementBuilder({
						type: "div",
						class: "tt-hjcp-static__title",
						text: "Planner module loaded.",
					}),
					elementBuilder({
						type: "div",
						class: "tt-hjcp-static__body",
						text: "Happy jump budgeting and passive income allocation tools will appear here.",
					}),
				],
			})
		);
	}

	function teardown() {
		removeContainer("Happy Jump Cash Planner");
	}
})();
