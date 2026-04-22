//ReactDom.js：把框架与页面入口连接起来

import React from "./React.js";
const ReactDOM = {
  createRoot(container) {
    return {
      render(App) {
        React.render(App, container);
      },
    };
  },
};

export default ReactDOM;
