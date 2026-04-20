// v1 原始 DOM 命令式写法：告诉浏览器“怎么做”，每一步都要亲自写。
// const dom = document.createElement("div");
// dom.id = "app";
// document.querySelector("#root").append(dom);

// const textNode = document.createTextNode("");
// textNode.nodeValue = "app";
// dom.append(textNode);


// v2 react -> vdom -> js object

// type props children
// const textEl = {
//   type: "TEXT_ELEMENT", // React 内部用这个标记文本节点
//   props: {
//     nodeValue: "app",
//     children: [],
//   },
// };
import ReactDOM from "./core/ReactDom.js";
import App from "./App.js";

ReactDOM.createRoot(document.querySelector("#root")).render(App);
