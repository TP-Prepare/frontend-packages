// Команды `board sync` и `board snapshot`: доска GitHub Projects v2 — поле с id треков и снимок доски в JSON.
// Настройки доски — раздел `board` в module-graph.yaml, токен — только GH_TOKEN. Спека §5.
import {
	type BoardConfig,
	type BoardSnapshot,
	type BoardSprint,
	type BoardTask,
	type Module,
	parseSnapshot,
} from "../index.ts";

export type FieldOption = { id: string; name: string; description: string; color: string };
export type OptionInput = { id?: string; name: string; description: string; color: string };
type BoardState = BoardTask["state"];

const NEW_OPTION_COLOR = "GRAY";

/** id трека → `title` из самого нового модуля (модули идут от новых к старым). */
export function trackCatalog(modules: readonly Module[]): Map<string, string> {
	const catalog = new Map<string, string>();
	for (const module of modules) {
		for (const track of module.tracks) if (!catalog.has(track.id)) catalog.set(track.id, track.title);
	}
	return catalog;
}

/**
 * Полный список значений для `updateProjectV2Field`: он ЗАМЕНЯЕТ список, поэтому каждое
 * существующее значение уходит со своим `id` (иначе оно пересоздаётся и выбор на карточках теряется).
 * Ничего не изменилось — `null`.
 */
export function planOptions(existing: readonly FieldOption[], tracks: ReadonlyMap<string, string>): OptionInput[] | null {
	let changed = false;
	const result: OptionInput[] = existing.map((option) => {
		const title = tracks.get(option.name);
		if (title !== undefined && title !== option.description) {
			changed = true;
			return { id: option.id, name: option.name, description: title, color: option.color };
		}
		return { id: option.id, name: option.name, description: option.description, color: option.color };
	});
	const known = new Set(existing.map((option) => option.name));
	const added = [...tracks.keys()].filter((id) => !known.has(id)).sort();
	for (const id of added) result.push({ name: id, description: tracks.get(id) ?? "", color: NEW_OPTION_COLOR });
	return changed || added.length > 0 ? result : null;
}

type Rec = Record<string, unknown>;
const isRec = (value: unknown): value is Rec => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
const fieldName = (value: unknown): string | null => (isRec(value) ? text(value.name) : null);

/** `репо#N` для репозитория владельца доски, иначе `владелец/репо#N` (у разных владельцев бывают репозитории с одним именем). */
function refOf(repository: unknown, number: unknown, owner: string): string {
	const name = isRec(repository) ? (text(repository.name) ?? "") : "";
	const login = isRec(repository) && isRec(repository.owner) ? text(repository.owner.login) : null;
	const prefix = login !== null && login.toLowerCase() !== owner.toLowerCase() ? `${login}/` : "";
	return `${prefix}${name}#${String(number)}`;
}

function toTask(content: Rec, node: Rec, owner: string): BoardTask {
	const parent = isRec(content.parent) && isRec(content.parent.repository)
		? refOf(content.parent.repository, content.parent.number, owner)
		: null;
	const closed = content.state === "CLOSED";
	const state: BoardState =
		closed && (content.stateReason === "NOT_PLANNED" || content.stateReason === "DUPLICATE")
			? "not_planned"
			: closed
				? "closed"
				: "open";
	const assignees = isRec(content.assignees) && Array.isArray(content.assignees.nodes) ? content.assignees.nodes : [];
	return {
		ref: refOf(content.repository, content.number, owner),
		title: text(content.title) ?? "",
		url: text(content.url) ?? "",
		state,
		status: fieldName(node.status),
		sprint: isRec(node.sprint) ? text(node.sprint.title) : null,
		assignees: assignees.flatMap((a) => (isRec(a) && typeof a.login === "string" ? [a.login] : [])),
		track: fieldName(node.track),
		parent,
	};
}

function toSprints(iterations: unknown): BoardSprint[] {
	const config = isRec(iterations) && isRec(iterations.configuration) ? iterations.configuration : {};
	const list = (value: unknown): Rec[] => (Array.isArray(value) ? value.filter(isRec) : []);
	return [...list(config.iterations), ...list(config.completedIterations)].map((s) => ({
		title: text(s.title) ?? "",
		start: text(s.startDate) ?? "",
		days: typeof s.duration === "number" ? s.duration : 0,
	}));
}

/** Узлы GraphQL → снимок; берутся только `Issue`. Результат проходит `parseSnapshot`. */
export function toSnapshot(items: readonly unknown[], iterations: unknown, takenAt: string, owner: string): BoardSnapshot {
	const tasks: BoardTask[] = [];
	for (const node of items) {
		if (isRec(node) && isRec(node.content) && node.content.__typename === "Issue") tasks.push(toTask(node.content, node, owner));
	}
	return parseSnapshot({ takenAt, sprints: toSprints(iterations), tasks });
}

// --- GraphQL ---

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// GitHub сообщает об отсутствующем поле ошибкой NOT_FOUND ровно на пути owner.projectV2.field
// (при этом data.owner.projectV2.field = null). Любая другая ошибка — настоящая.
const isMissingField = (error: unknown) =>
	isRec(error) && error.type === "NOT_FOUND" && sameJson(error.path, ["owner", "projectV2", "field"]);

async function gql(token: string, query: string, variables: Rec, tolerate?: (error: unknown) => boolean): Promise<Rec> {
	const response = await fetch("https://api.github.com/graphql", {
		method: "POST",
		headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "module-graph" },
		body: JSON.stringify({ query, variables }),
	});
	const body: unknown = await response.json().catch(() => null);
	if (!response.ok || !isRec(body)) throw new Error(`GitHub API: HTTP ${response.status}`);
	const errors = Array.isArray(body.errors) ? body.errors.filter((e) => !tolerate?.(e)) : [];
	if (errors.length > 0) {
		const messages = errors.map((e) => (isRec(e) ? String(e.message) : String(e))).join("; ");
		throw new Error(`GitHub API: ${messages}`);
	}
	if (!isRec(body.data)) throw new Error("GitHub API: нет data в ответе");
	return body.data;
}

/** Владелец доски — организация или пользователь: от этого зависит корень запроса. */
export async function ownerKind(token: string, owner: string): Promise<"organization" | "user"> {
	const data = await gql(token, "query($login: String!) { repositoryOwner(login: $login) { __typename } }", { login: owner });
	const kind = isRec(data.repositoryOwner) ? data.repositoryOwner.__typename : null;
	if (kind === "Organization") return "organization";
	if (kind === "User") return "user";
	if (kind === null || kind === undefined) throw new Error(`владелец ${owner} не найден`);
	throw new Error(`владелец ${owner}: ${String(kind)} — нужна организация или пользователь`);
}

const projectRoot = (board: BoardConfig, data: Rec): Rec => {
	const owner = data.owner;
	const project = isRec(owner) ? owner.projectV2 : null;
	if (!isRec(project)) throw new Error(`доска ${board.owner}/${board.project} не найдена`);
	return project;
};

// Алиас owner: тип владельца задаётся полем organization / user.
const ownerQuery = (kind: "organization" | "user", inner: string) =>
	`query($login: String!, $number: Int!${inner.includes("$after") ? ", $after: String" : ""}) { owner: ${kind}(login: $login) { projectV2(number: $number) { ${inner} } } }`;

const FIELD_SELECTION = `id options { id name description color }`;

async function fetchTrackField(
	token: string,
	board: BoardConfig,
	kind: "organization" | "user",
): Promise<{ projectId: string; field: { id: string; options: FieldOption[] } | null }> {
	const query = ownerQuery(
		kind,
		`id field(name: ${JSON.stringify(board.field)}) { ... on ProjectV2SingleSelectField { ${FIELD_SELECTION} } }`,
	);
	const data = await gql(token, query, { login: board.owner, number: board.project }, isMissingField);
	const project = projectRoot(board, data);
	if (typeof project.id !== "string") throw new Error("GitHub API: нет id доски в ответе");
	const field = isRec(project.field) && typeof project.field.id === "string" ? project.field : null;
	// Без списка значений мутация заменила бы поле пустым: лучше упасть.
	if (field && !Array.isArray(field.options)) throw new Error(`GitHub API: у поля «${board.field}» нет списка options`);
	return {
		projectId: String(project.id),
		field: field ? { id: String(field.id), options: field.options as FieldOption[] } : null,
	};
}

const optionsInput = (options: readonly OptionInput[]) =>
	options.map(({ id, name, description, color }) => ({ ...(id ? { id } : {}), name, description, color }));

/** `sync`: создаёт или пополняет поле `board.field`. Возвращает число добавленных значений. */
export async function sync(token: string, board: BoardConfig, tracks: ReadonlyMap<string, string>): Promise<number> {
	const kind = await ownerKind(token, board.owner);
	const { projectId, field } = await fetchTrackField(token, board, kind);
	if (!field) {
		const options = planOptions([], tracks) ?? [];
		await gql(
			token,
			`mutation($input: CreateProjectV2FieldInput!) { createProjectV2Field(input: $input) { projectV2Field { ... on ProjectV2SingleSelectField { id } } } }`,
			{ input: { projectId, dataType: "SINGLE_SELECT", name: board.field, singleSelectOptions: optionsInput(options) } },
		);
		return options.length;
	}
	const plan = planOptions(field.options, tracks);
	if (plan === null) return 0;
	await gql(
		token,
		`mutation($input: UpdateProjectV2FieldInput!) { updateProjectV2Field(input: $input) { projectV2Field { ... on ProjectV2SingleSelectField { id } } } }`,
		{ input: { fieldId: field.id, singleSelectOptions: optionsInput(plan) } },
	);
	return plan.length - field.options.length;
}

const itemSelection = (field: string) => `content { __typename ... on Issue { number title url state stateReason repository { name owner { login } } assignees(first: 10) { nodes { login } } parent { number repository { name owner { login } } } } }
status: fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
sprint: fieldValueByName(name: "Sprint") { ... on ProjectV2ItemFieldIterationValue { title } }
track: fieldValueByName(name: ${JSON.stringify(field)}) { ... on ProjectV2ItemFieldSingleSelectValue { name } }`;

const SPRINT_FIELD = `field(name: "Sprint") { ... on ProjectV2IterationField { configuration { iterations { title startDate duration } completedIterations { title startDate duration } } } }`;

/** `snapshot`: все карточки доски постранично (по 100) и итерации Sprint. */
export async function fetchSnapshot(token: string, board: BoardConfig, takenAt: string): Promise<BoardSnapshot> {
	const kind = await ownerKind(token, board.owner);
	const query = ownerQuery(
		kind,
		`${SPRINT_FIELD} items(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { ${itemSelection(board.field)} } }`,
	);
	const items: unknown[] = [];
	let iterations: unknown = null;
	let after: string | null = null;
	for (;;) {
		const project = projectRoot(board, await gql(token, query, { login: board.owner, number: board.project, after }));
		iterations = project.field;
		const page = project.items;
		if (!isRec(page) || !Array.isArray(page.nodes) || !isRec(page.pageInfo)) throw new Error("GitHub API: нет items в ответе");
		items.push(...page.nodes);
		if (page.pageInfo.hasNextPage !== true) break;
		after = text(page.pageInfo.endCursor);
	}
	return toSnapshot(items, iterations, takenAt, board.owner);
}
