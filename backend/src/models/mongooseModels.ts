import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
    avatar: { type: String, default: "" },
  },
  { timestamps: true }
);

const AnalysisRunSchema = new mongoose.Schema(
  {
    repositoryUrl: { type: String, default: "" },
    branch: { type: String, default: "main" },
    testCommand: { type: String, default: "npm test" },
    status: { type: String, enum: ["QUEUED", "RUNNING", "COMPLETED", "FAILED"], default: "QUEUED" },
    errorLog: { type: String, default: "" },
    prMarkdown: { type: String, default: "" },
    diffJson: { type: String, default: "" },
    userId: { type: String, default: "anonymous" },
  },
  { timestamps: true }
);

export const UserModel = mongoose.models.User || mongoose.model("User", UserSchema);
export const AnalysisRunModel = mongoose.models.AnalysisRun || mongoose.model("AnalysisRun", AnalysisRunSchema);
