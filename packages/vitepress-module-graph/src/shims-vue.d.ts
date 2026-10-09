// Импорт .vue из .ts для tsc; типы компонентов проверяет vue-tsc.
declare module "*.vue" {
	import type { DefineComponent } from "vue";
	const component: DefineComponent;
	export default component;
}
