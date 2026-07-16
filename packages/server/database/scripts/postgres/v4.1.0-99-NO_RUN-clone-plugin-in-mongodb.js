let OLD_ID = "plugin-workflow-client";
let NEW_ID = "plugin-workflow";

db.getCollection("clients")
  .find()
  .forEach((e) => {
    if (e.extras && e.extras[OLD_ID]) {
      e.extras[NEW_ID] = e.extras[OLD_ID];
      print(e);
      db.getCollection("clients").updateOne(
        {
          _id: e._id,
        },
        [{ $replaceRoot: { newRoot: e } }]
      );
    }
  });
