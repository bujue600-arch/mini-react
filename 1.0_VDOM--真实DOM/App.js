import React from './core/React.js';

//不再直接创建 DOM，返回一个 JavaScript 对象：VDOM
const App = React.createElement("div", { id: "app" }, "hi- ", "mini-react");

export default App